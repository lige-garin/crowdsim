import {
  parseScene,
  type CrowdSimScene,
  type ScenePoint,
} from "@crowdsim/scene-schema";

/**
 * ASCII DXF -> scene walls.
 *
 * HONESTY NOTE (see docs/CLAIMS_LEDGER.md): this reads the geometry that is
 * actually in the file. It is not BIM — it does not know that an entity is a
 * wall, a door or a stair, and it does not recognise openings. A DXF has no
 * semantic layer, so what comes in is linework: every supported entity becomes
 * a solid wall of the same thickness. Doors have to be cut afterwards, by
 * deleting or splitting the imported walls in the editor.
 *
 * Binary DXF is not supported; it is rare and the ASCII form is what CAD tools
 * export for interchange.
 */

/** DXF $INSUNITS (header group code 70) -> metres. Unlisted codes mean unknown. */
const metersPerDxfUnit: Record<number, number> = {
  1: 0.0254, // inches
  2: 0.3048, // feet
  4: 0.001, // millimetres
  5: 0.01, // centimetres
  6: 1, // metres
  7: 1000, // kilometres
  8: 1e-10, // microinches
  9: 1e-6, // mils
  10: 0.0000254, // mils (AutoCAD also lists 10 here)
  11: 1e-10, // angstroms
  12: 1e-9, // nanometres
  13: 1e-6, // microns
  14: 0.01, // decimetres
  15: 1, // decametres
  16: 10, // hectometres
  17: 1e9, // gigametres
  18: 1.495978707e11, // astronomical units
  19: 9.4607304725808e15, // light years
  20: 3.08567758149137e16, // parsecs
};

export type DxfImportOptions = {
  /**
   * Import only these layers (DXF group code 8). Omit to import every layer.
   * Architectural exports often carry dozens of layers, most of them
   * annotation, so filtering is usually what you want.
   */
  layers?: readonly string[];
  /** Force a unit scale instead of reading $INSUNITS from the header. */
  metersPerUnit?: number;
  /** Wall thickness for imported geometry. Defaults to 0.2 m. */
  thickness?: number;
};

export type DxfImportResult = {
  /** Entity types present in the file that this importer does not convert. */
  skippedEntityTypes: string[];
  /** Null when the file declares no units and none were supplied. */
  units: number | null;
  wallCount: number;
};

type GroupPair = {
  code: number;
  value: string;
};

type DxfEntity = {
  layer: string;
  pairs: GroupPair[];
  type: string;
};

export function createSceneFromDxf(
  baseScene: CrowdSimScene,
  input: string,
  options: DxfImportOptions = {},
): CrowdSimScene {
  const { scene } = createSceneFromDxfWithReport(baseScene, input, options);

  return scene;
}

export function createSceneFromDxfWithReport(
  baseScene: CrowdSimScene,
  input: string,
  options: DxfImportOptions = {},
): DxfImportResult & { scene: CrowdSimScene } {
  const pairs = readGroupPairs(input);
  const declaredUnits = options.metersPerUnit ?? readDeclaredUnits(pairs);
  const scale = options.metersPerUnit ?? metersPerDxfUnit[declaredUnits ?? 0] ?? 1;
  const entities = collectEntities(pairs).filter((entity) =>
    inAllowedLayer(entity, options.layers),
  );

  const skipped = new Set<string>();
  const walls = entities.flatMap((entity, index) => {
    const points = pointsFromEntity(entity, scale);

    // Fewer than two points is not a wall: an unsupported entity yields none,
    // and a malformed one can yield a single orphan vertex.
    if (points.length < 2) {
      skipped.add(entity.type);
      return [];
    }

    return [
      {
        id: dxfWallId(entity, index),
        geometry: {
          type: points.length >= 3 ? "polygon" : "polyline",
          points,
        } as CrowdSimScene["walls"][number]["geometry"],
        thickness: options.thickness ?? 0.2,
      },
    ];
  });

  const importedWalls = dedupeWalls([...baseScene.walls, ...walls]);

  return {
    scene: parseScene({
      ...baseScene,
      // Imported geometry routinely sits outside the draft world; clipping it
      // silently would drop half a floor plan without saying so.
      world: worldContaining(baseScene.world, walls),
      walls: importedWalls,
    }),
    skippedEntityTypes: [...skipped].sort(),
    units: declaredUnits,
    wallCount: walls.length,
  };
}

/**
 * DXF is a flat list of (group code, value) pairs spread over two lines each.
 * Stray blank lines and comments are skipped rather than treated as data.
 */
function readGroupPairs(input: string): GroupPair[] {
  const lines = input.split(/\r\n|\r|\n/);
  const pairs: GroupPair[] = [];
  let index = 0;

  while (index < lines.length - 1) {
    const code = Number.parseInt(lines[index].trim(), 10);

    if (Number.isNaN(code)) {
      index++;
      continue;
    }

    pairs.push({ code, value: lines[index + 1].trim() });
    index += 2;
  }

  return pairs;
}

function readDeclaredUnits(pairs: readonly GroupPair[]): number | null {
  for (let index = 0; index < pairs.length - 1; index++) {
    if (
      pairs[index].code === 9 &&
      pairs[index].value === "$INSUNITS" &&
      pairs[index + 1].code === 70
    ) {
      const units = Number.parseInt(pairs[index + 1].value, 10);

      return Number.isNaN(units) ? null : units;
    }
  }

  return null;
}

function collectEntities(pairs: readonly GroupPair[]): DxfEntity[] {
  const section = entitiesSectionPairs(pairs);
  const entities: DxfEntity[] = [];
  let current: DxfEntity | null = null;

  for (const pair of section) {
    if (pair.code === 0) {
      current = { layer: "", pairs: [], type: pair.value };
      entities.push(current);
      continue;
    }

    if (!current) {
      continue;
    }

    if (pair.code === 8) {
      current.layer = pair.value;
      continue;
    }

    current.pairs.push(pair);
  }

  return entities;
}

function entitiesSectionPairs(pairs: readonly GroupPair[]): GroupPair[] {
  for (let index = 0; index < pairs.length - 2; index++) {
    const isEntitiesSection =
      pairs[index].code === 0 &&
      pairs[index].value === "SECTION" &&
      pairs[index + 1].code === 2 &&
      pairs[index + 1].value === "ENTITIES";

    if (!isEntitiesSection) {
      continue;
    }

    const section: GroupPair[] = [];

    for (let cursor = index + 2; cursor < pairs.length; cursor++) {
      if (pairs[cursor].code === 0 && pairs[cursor].value === "ENDSEC") {
        break;
      }

      section.push(pairs[cursor]);
    }

    return section;
  }

  return [];
}

function inAllowedLayer(
  entity: DxfEntity,
  layers: readonly string[] | undefined,
): boolean {
  return !layers || layers.length === 0 || layers.includes(entity.layer);
}

function pointsFromEntity(
  entity: DxfEntity,
  scale: number,
): ScenePoint[] {
  switch (entity.type) {
    case "LINE":
      return linePoints(entity, scale);
    case "LWPOLYLINE":
      return lwPolylinePoints(entity, scale);
    case "CIRCLE":
      return circlePoints(entity, scale);
    case "ARC":
      return arcPoints(entity, scale);
    default:
      return [];
  }
}

function linePoints(entity: DxfEntity, scale: number): ScenePoint[] {
  const values = numbersByCode(entity.pairs, [10, 20, 11, 21]);

  if (values[10] === undefined || values[20] === undefined) {
    return [];
  }

  const start = { x: values[10] * scale, y: values[20] * scale };
  const end =
    values[11] === undefined || values[21] === undefined
      ? null
      : { x: values[11] * scale, y: values[21] * scale };

  return end ? [start, end] : [];
}

/**
 * LWPOLYLINE repeats group code 10/20 per vertex, so the first 10 opens a
 * vertex and each later 10 opens the next one. Group 70 bit 0 marks it closed.
 */
function lwPolylinePoints(entity: DxfEntity, scale: number): ScenePoint[] {
  const points: ScenePoint[] = [];
  let pendingX: number | null = null;
  let closed = false;

  for (const pair of entity.pairs) {
    if (pair.code === 70) {
      closed = (Number.parseInt(pair.value, 10) & 1) === 1;
      continue;
    }

    const value = Number.parseFloat(pair.value);

    if (Number.isNaN(value)) {
      continue;
    }

    if (pair.code === 10) {
      // A 10 with no following 20 is malformed. Overwrite rather than invent
      // a y for it: a wall built from a guessed vertex is worse than one
      // vertex fewer.
      pendingX = value;
      continue;
    }

    if (pair.code === 20 && pendingX !== null) {
      points.push({ x: pendingX * scale, y: value * scale });
      pendingX = null;
    }
  }

  if (closed && points.length >= 3) {
    points.push({ ...points[0] });
  }

  return points;
}

function circlePoints(entity: DxfEntity, scale: number): ScenePoint[] {
  const values = numbersByCode(entity.pairs, [10, 20, 40]);

  if (values[10] === undefined || values[20] === undefined || !values[40]) {
    return [];
  }

  return arcSamples(
    { x: values[10] * scale, y: values[20] * scale },
    values[40] * scale,
    0,
    360,
  );
}

function arcPoints(entity: DxfEntity, scale: number): ScenePoint[] {
  const values = numbersByCode(entity.pairs, [10, 20, 40, 50, 51]);

  if (values[10] === undefined || values[20] === undefined || !values[40]) {
    return [];
  }

  return arcSamples(
    { x: values[10] * scale, y: values[20] * scale },
    values[40] * scale,
    values[50] ?? 0,
    values[51] ?? 360,
  );
}

function arcSamples(
  center: ScenePoint,
  radius: number,
  startDegrees: number,
  endDegrees: number,
): ScenePoint[] {
  const sweep = endDegrees - startDegrees;
  const segments = Math.max(8, Math.ceil(Math.abs(sweep) / 15));
  const points: ScenePoint[] = [];

  for (let index = 0; index <= segments; index++) {
    const degrees = startDegrees + (sweep * index) / segments;
    const radians = (degrees * Math.PI) / 180;

    points.push({
      x: center.x + radius * Math.cos(radians),
      y: center.y + radius * Math.sin(radians),
    });
  }

  return points;
}

function numbersByCode(
  pairs: readonly GroupPair[],
  codes: readonly number[],
): Record<number, number | undefined> {
  const found: Record<number, number | undefined> = {};

  for (const pair of pairs) {
    if (!codes.includes(pair.code) || found[pair.code] !== undefined) {
      continue;
    }

    const value = Number.parseFloat(pair.value);

    if (!Number.isNaN(value)) {
      found[pair.code] = value;
    }
  }

  return found;
}

function dxfWallId(entity: DxfEntity, index: number): string {
  const layer = entity.layer.replace(/[^a-zA-Z0-9_-]/g, "-");
  const stem = layer ? `dxf-${layer}` : "dxf-entity";

  return `${stem}-${index + 1}`;
}

function dedupeWalls(walls: CrowdSimScene["walls"]): CrowdSimScene["walls"] {
  const seen = new Set<string>();

  return walls.filter((wall) => {
    if (seen.has(wall.id)) {
      return false;
    }

    seen.add(wall.id);
    return true;
  });
}

function worldContaining(
  world: { height: number; width: number },
  walls: readonly { geometry: { points: readonly ScenePoint[] } }[],
): { height: number; width: number } {
  let maxX = world.width;
  let maxY = world.height;

  for (const wall of walls) {
    for (const point of wall.geometry.points) {
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  if (maxX === world.width && maxY === world.height) {
    return world;
  }

  // Round up so the plan never lands exactly on the boundary.
  return {
    height: Math.ceil(maxY + 1),
    width: Math.ceil(maxX + 1),
  };
}
