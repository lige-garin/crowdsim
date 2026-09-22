# ADR 0018: IFC/BIM import — a real dependency, chosen over a from-scratch parser

- Status: Accepted (2026-09-23)
- Gap-closure plan batch 5.3 ("IFC / BIM 导入")

## Context

The plan's own text: "顾问项目的图纸多是 Revit/IFC；现在只有 DXF/GeoJSON/图片"
(consulting projects' drawings are mostly Revit/IFC; only DXF/GeoJSON/image
import exist today). `dxfImport.ts` and `geojsonImport.ts` are both
from-scratch, zero-dependency parsers — a working, disclosed precedent
(`dxfImport.ts`'s own doc comment: "it does not know that an entity is a
wall, a door or a stair... every supported entity becomes a solid wall").

IFC (ISO 16739, STEP/ISO-10303-21 text encoding) is not the same kind of
problem. DXF and GeoJSON are flat entity lists with inline absolute
coordinates. IFC geometry sits behind an entity-reference graph
(`IfcWall` → `IfcProductDefinitionShape` → `IfcShapeRepresentation` →
`IfcExtrudedAreaSolid` → a profile definition) and a nested placement-
transform stack (`IfcLocalPlacement` chains up through storey, building,
site). A from-scratch reader for even a bounded "walls only" subset would
be roughly an order of magnitude more code than `dxfImport.ts`, and —
critically — would very likely still fail on real exports from the
authoring tool the plan's own text names: Revit commonly represents wall
geometry as triangulated B-reps (`IfcFacetedBrep`/`IfcTriangulatedFaceSet`),
not the simple extrusions a bounded reader could realistically support.
Shipping that would be a "looks like IFC support, doesn't handle real IFC
files" feature — the exact class of overclaiming this project's own
honesty ledger exists to catch.

Asked directly (this repo's `CLAUDE.md` requires justifying a new heavy
dependency before adding one), the user chose to add `web-ifc` — a real
WASM build of IfcOpenShell's geometry engine — over both a from-scratch
subset parser and deferring the batch.

## Decision

Add `web-ifc@0.0.78` to `packages/app`, and `packages/app/src/ifcImport.ts`
— the same `createSceneFromXWithReport` shape `dxfImport.ts` and
`geojsonImport.ts` already use, reading `IfcWall`/`IfcWallStandardCase`
geometry into scene walls.

### Why `web-ifc` over the alternative, concretely

`web-ifc` does real BIM geometry evaluation — it resolves the placement
chain, evaluates whatever solid representation a wall actually uses
(extrusion, B-rep, triangulated mesh, swept disk, ...), and hands back a
resolved 3D triangle mesh in world space. This project's own reader only
has to do 2D work after that: project the mesh to the floor plane and take
its convex hull. That division of labour is exactly why `web-ifc` closes
the Revit gap a from-scratch parser could not — it is not a bigger DXF
reader, it is a different kind of engine underneath a thin, disclosed,
walls-only reading of its output.

### Real integration problems found only by actually running it, not assumed

Every one of these was caught by loading the feature in a real browser and
watching it fail, not by reading `web-ifc`'s documentation:

- **`mesh.geometries` is not iterable**, despite its own `.d.ts` declaring
  `extends Iterable<T>` — the runtime emscripten-embind `Vector` does not
  implement `Symbol.iterator`. `ifcImport.ts` uses indexed `.get(i)`/
  `.size()` access instead, confirmed against the actual npm package via a
  throwaway Node script before either the vitest suite or the module code
  was written, then confirmed again by vitest actually throwing on `for...of`
  and passing once switched to indexing.
- **web-ifc's multithreaded build spawns a classic (non-module) Worker**
  running code that uses `import.meta`, which only works inside a real ES
  module — every import attempt in a real browser threw
  `Cannot use 'import.meta' outside a module` until `Init()` was called
  with `forceSingleThread: true`. A one-off floor-plan import is not a hot
  path worth chasing that fragility for the parallelism it would buy.
- **`IfcAPI.SetWasmPath`'s directory-prefix-plus-loader's-own-filename-guess
  approach broke two different ways**, both only visible in a real
  production build (the dev server resolves `web-ifc`'s Node-targeted
  export and never exercises this path at all): a literal `"web-ifc.wasm"`
  string match failed to strip a production build's hashed filename
  (`web-ifc-BDaIXFUT.wasm`), and even once that was fixed to a generic
  "last path segment" split, the loader's own string concatenation dropped
  a path separator, sending it looking for
  `/assets/web-ifc-BDaIXFUT.wasmweb-ifc.wasm`. Replaced with `Init()`'s
  `customLocateFileHandler` argument — a function that always returns the
  exact URL Vite already resolved via a `?url` asset import — which
  sidesteps directory-prefix arithmetic entirely.
- **Vite's esbuild dependency pre-bundling breaks web-ifc's own worker
  script**: pre-bundled, the same `import.meta` error recurred regardless
  of `forceSingleThread`. Fixed with `optimizeDeps.exclude: ["web-ifc"]` in
  `vite.config.ts`.

Confirmed working end to end, in both environments a real user would
actually hit: `pnpm dev` and a real `vite build` + `vite preview`, each
verified by dispatching a real `File`/`change` event at the real hidden
`<input type="file">` the editor's "导入 IFC" button clicks, in a real
browser tab, and reading the resulting "已导入 IFC：N 面墙" status text and
scene wall count back out of the live page — not merely a passing vitest
suite, since vitest's Node environment resolves an entirely different,
Node-targeted `web-ifc` entry point that never exercises any of the four
problems above.

### What this is not

- **Not BIM, in this project.** The same disclosure `dxfImport.ts` carries:
  only `IfcWall`/`IfcWallStandardCase` geometry is read. Doors, windows,
  spaces, slabs, stairs, and every other IFC entity type, and all property
  sets, are ignored — reported as a plain `hadUnconvertedEntities` boolean
  (which entity types were present, not what they were), not imported.
- **A wall's footprint is its resolved mesh's 2D convex hull** — exact for
  the rectangular/box-ish walls that make up most real floor plans, an
  over-approximation for a curved or L-shaped wall, the same disclosed
  simplification `convexHull2D` itself carries in its own doc comment.
- **~7 MB (uncompressed) of WASM and glue JS, entirely behind a dynamic
  `import("web-ifc")`** inside `ifcImport.ts` — confirmed by the production
  build's own chunk listing showing `web-ifc-api-*.js` and `web-ifc-*.wasm`
  as separate chunks, never touching the initial app-shell bundle, the
  same lazy-init discipline `behaviorWasm.ts` already established for this
  project's own Rust→WASM core.

## Consequences

- `packages/app/package.json` gains its first third-party WASM dependency;
  `pnpm-lock.yaml` updated accordingly.
- `dxfImport.ts`'s own `dedupeWalls`/`worldContaining` helpers were
  extracted into a new shared `importGeometry.ts` (alongside the new
  `convexHull2D`) once `ifcImport.ts` gave them a second real caller — the
  same "extract once there are two real call sites" pattern this session
  already used for `boundedNelderMead.ts` and `csvParsing.ts`.
- No IFC entity beyond walls is read. A future pass adding doors/windows/
  spaces would extend `ifcImport.ts`'s own `StreamAllMeshesWithTypes` call
  and needs its own scoping — not attempted here.
