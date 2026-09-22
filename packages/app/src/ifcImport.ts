import {
  parseScene,
  type CrowdSimScene,
  type ScenePoint,
} from "@crowdsim/scene-schema";
import { convexHull2D, dedupeWalls, worldContaining } from "./importGeometry";

/**
 * IFC (buildingSMART's Industry Foundation Classes, ISO 16739) -> scene
 * walls. Gap-closure plan batch 5.3; the user explicitly authorized adding
 * `web-ifc` (a real IFC geometry engine, wrapping IfcOpenShell as WASM) for
 * this after being shown the alternative: a from-scratch STEP parser, like
 * this project's own zero-dependency `dxfImport.ts`, would be roughly an
 * order of magnitude more code than DXF's flat entity list (IFC's geometry
 * sits behind an entity-reference graph and nested placement transforms),
 * and would very likely still fail on real Revit exports, which commonly
 * represent walls as triangulated B-reps rather than simple extrusions —
 * exactly the authoring tool the plan's own text names. `web-ifc` handles
 * both representations (and everything else IFC's geometry model allows)
 * uniformly, because it does real BIM geometry evaluation rather than
 * reading one shape kind.
 *
 * HONESTY NOTE (see docs/CLAIMS_LEDGER.md), the same disclosure `dxfImport.ts`
 * carries: this is not BIM in this project. It reads `IfcWall`/
 * `IfcWallStandardCase` geometry and nothing else — no doors, windows,
 * spaces, slabs, stairs, or any of IFC's few hundred other entity types, and
 * no property sets. A wall's footprint (every vertex of its resolved 3D
 * mesh, projected to the floor plane and reduced to its 2D convex hull) is
 * exact for the rectangular/box-ish walls that make up most real floor
 * plans; a curved or L-shaped wall's footprint is over-approximated by its
 * convex hull, the same disclosed limitation `convexHull2D` itself carries.
 * `web-ifc` is loaded via a dynamic `import("web-ifc")`, the same lazy-init
 * pattern `behaviorWasm.ts` already uses for this project's own Rust->WASM
 * core, so its ~7 MB (uncompressed) of WASM and glue JS never touches the
 * initial app-shell bundle.
 */

export type IfcImportOptions = {
  /** Wall thickness recorded on the imported entity. The polygon geometry
   * itself is the wall's real footprint either way; this only matters if a
   * scene author later edits the wall down to a centerline. Defaults to
   * 0.2 m, matching `dxfImport.ts`'s own default. */
  thickness?: number;
  /**
   * The exact URL `web-ifc`'s browser build should fetch its `.wasm` file
   * from. Left unset in this module's own tests, where vitest's Node
   * environment resolves web-ifc's Node-targeted entry (package.json's own
   * "node" export condition) and reads the file from disk directly.
   *
   * A full URL, not a directory prefix: this project first tried
   * `IfcAPI.SetWasmPath` (a directory the loader appends its own filename
   * guess to), which broke two different ways only a real production build
   * surfaced -- a literal `web-ifc.wasm` string match failed to strip a
   * production build's hashed filename, and even fixed, the loader's own
   * string concatenation dropped a path separator. Passing web-ifc's own
   * `customLocateFileHandler` (its `Init()` first argument) a function that
   * always returns this exact URL sidesteps both, however the loader would
   * otherwise have guessed.
   */
  wasmUrl?: string;
};

export type IfcImportResult = {
  /** True if the file declared entities of a type this importer doesn't
   * convert (doors, windows, spaces, slabs, ...) -- not their names, since
   * `web-ifc` only reports geometry for the types requested. */
  hadUnconvertedEntities: boolean;
  wallCount: number;
};

/** The floor-plan projection this module's own doc comment describes:
 * `web-ifc` returns geometry already converted to a Y-up (three.js-style)
 * frame, so a wall's original horizontal footprint is its (x, -z) plane,
 * not (x, y). Verified against a hand-built fixture with a known footprint
 * (`ifcImport.test.ts`), not assumed from documentation alone. */
function floorPoint(vertex: readonly [number, number, number]): ScenePoint {
  return { x: vertex[0], y: -vertex[2] };
}

function applyFlatTransformation(
  vertex: readonly [number, number, number],
  matrix: ArrayLike<number>,
): [number, number, number] {
  const [x, y, z] = vertex;
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ];
}

export async function createSceneFromIfcWithReport(
  baseScene: CrowdSimScene,
  data: Uint8Array,
  options: IfcImportOptions = {},
): Promise<IfcImportResult & { scene: CrowdSimScene }> {
  const ifc = await import("web-ifc");
  const {
    IfcAPI,
    IFCWALL,
    IFCWALLSTANDARDCASE,
    IFCDOOR,
    IFCWINDOW,
    IFCSLAB,
    IFCSPACE,
    IFCSTAIR,
    IFCROOF,
    IFCCOLUMN,
    IFCBEAM,
    IFCCURTAINWALL,
  } = ifc;
  const api = new IfcAPI();
  // Forced single-threaded: web-ifc's multithreaded build spawns a classic
  // (non-module) Worker running code that uses `import.meta`, which only
  // works in a real module -- confirmed by actually running an import in
  // the browser, where it failed this way on every attempt regardless of
  // Vite's dependency pre-bundling. A one-off floor-plan import is not a
  // hot path worth that fragility for the parallelism it would buy.
  await api.Init(
    options.wasmUrl === undefined ? undefined : () => options.wasmUrl!,
    true,
  );

  const modelID = api.OpenModel(data, { COORDINATE_TO_ORIGIN: false });
  try {
    const walls: CrowdSimScene["walls"] = [];

    api.StreamAllMeshesWithTypes(
      modelID,
      [IFCWALL, IFCWALLSTANDARDCASE],
      (mesh) => {
        const floorPoints: ScenePoint[] = [];

        // `mesh.geometries` is web-ifc's own emscripten-embind Vector: its
        // .d.ts declares `extends Iterable<T>`, but the runtime object does
        // not actually implement `Symbol.iterator` (confirmed by running
        // this against the real package, not assumed from the type
        // declaration) -- indexed access is what actually works.
        for (let g = 0; g < mesh.geometries.size(); g++) {
          const placed = mesh.geometries.get(g);
          const geometry = api.GetGeometry(modelID, placed.geometryExpressID);
          const vertexData = api.GetVertexArray(
            geometry.GetVertexData(),
            geometry.GetVertexDataSize(),
          );
          // Interleaved position+normal, 6 floats per vertex (web-ifc's own
          // fixed layout) -- only the first 3 (position) matter here.
          for (let i = 0; i < vertexData.length; i += 6) {
            const world = applyFlatTransformation(
              [vertexData[i], vertexData[i + 1], vertexData[i + 2]],
              placed.flatTransformation,
            );
            floorPoints.push(floorPoint(world));
          }
          geometry.delete();
        }

        const hull = convexHull2D(floorPoints);
        if (hull.length < 3) return; // degenerate: no real footprint

        walls.push({
          geometry: { points: hull, type: "polygon" },
          id: `ifc-wall-${mesh.expressID}`,
          thickness: options.thickness ?? 0.2,
        });
      },
      true,
    );

    // IFC building-element types this importer does not read geometry for,
    // checked only to report (as a plain boolean --
    // `IfcImportResult.hadUnconvertedEntities`) that the file had more in it
    // than what came in as walls.
    const hadUnconvertedEntities = [
      IFCDOOR,
      IFCWINDOW,
      IFCSLAB,
      IFCSPACE,
      IFCSTAIR,
      IFCROOF,
      IFCCOLUMN,
      IFCBEAM,
      IFCCURTAINWALL,
    ].some((type) => api.GetLineIDsWithType(modelID, type).size() > 0);

    const importedWalls = dedupeWalls([...baseScene.walls, ...walls]);

    return {
      hadUnconvertedEntities,
      scene: parseScene({
        ...baseScene,
        world: worldContaining(baseScene.world, walls),
        walls: importedWalls,
      }),
      wallCount: walls.length,
    };
  } finally {
    api.CloseModel(modelID);
  }
}
