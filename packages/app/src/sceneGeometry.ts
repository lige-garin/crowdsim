import type { WallSegment } from "@crowdsim/core-gpu";
import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";

export type SceneWorldBounds = {
  height: number;
  width: number;
};

export type MovementConstraintResult = {
  blocked: boolean;
  x: number;
  y: number;
};

const intersectionEpsilon = 1e-6;
const contactEpsilonMeters = 1e-6;

/**
 * Doorway cut into a building footprint at each declared entrance. The scene
 * schema has no door width, so this is a typical shopfront/arcade opening.
 */
export const buildingDoorwayWidthMeters = 3;

/**
 * An entrance this close to a footprint edge opens that edge. Shops in an
 * arcade often mark their door a step or two out on the pavement rather than
 * exactly on the facade line.
 */
export const doorwaySnapMeters = 2.5;

/**
 * Every line an agent cannot walk through: walls, obstacles that block
 * movement, blocked areas, non-walkable zones, and building footprints.
 *
 * Only `scene.walls` used to count, so a construction barrier, a building or a
 * closed-off area was drawn and analysed but walked straight through.
 *
 * Buildings are entered, not just walked around (shops sit inside arcades), so
 * a footprint gets a doorway at the building's own entrance and at every shop
 * entrance on its facade. A building with no entrance near its edge is solid.
 */
export function wallSegmentsFromScene(scene: CrowdSimScene): WallSegment[] {
  const segments = scene.walls.flatMap((wall) =>
    pathSegments(wall.geometry.points, wall.geometry.type === "polygon"),
  );

  for (const obstacle of scene.obstacles) {
    if (!obstacle.blocksMovement) continue;
    const { points, type } = obstacle.geometry;
    segments.push(...pathSegments(points, type === "polygon"));
  }
  for (const area of scene.areas) {
    if (area.kind === "blocked")
      segments.push(...pathSegments(area.geometry.points, true));
  }
  for (const zone of scene.zones) {
    if (!zone.walkable) segments.push(...pathSegments(zone.geometry.points, true));
  }

  const doors = [
    ...scene.buildings.flatMap((building) => building.entrancePosition ?? []),
    ...scene.shops.flatMap((shop) => shop.entrancePosition ?? []),
  ];
  for (const building of scene.buildings) {
    for (const edge of pathSegments(building.footprint.points, true)) {
      segments.push(...cutDoorways(edge, doors));
    }
  }

  return segments;
}

function pathSegments(points: readonly ScenePoint[], closed: boolean): WallSegment[] {
  const segments: WallSegment[] = [];

  for (let index = 1; index < points.length; index++) {
    segments.push({
      x1: points[index - 1].x,
      y1: points[index - 1].y,
      x2: points[index].x,
      y2: points[index].y,
    });
  }

  if (closed && points.length > 2) {
    const first = points[0];
    const last = points[points.length - 1];
    segments.push({ x1: last.x, y1: last.y, x2: first.x, y2: first.y });
  }

  return segments;
}

/** What is left of `edge` once a doorway is cut at each door close to it. */
function cutDoorways(edge: WallSegment, doors: readonly ScenePoint[]): WallSegment[] {
  const dx = edge.x2 - edge.x1;
  const dy = edge.y2 - edge.y1;
  const length = Math.hypot(dx, dy);
  if (length === 0) return [];

  const half = buildingDoorwayWidthMeters / 2;
  const gaps: [number, number][] = [];
  for (const door of doors) {
    const along = ((door.x - edge.x1) * dx + (door.y - edge.y1) * dy) / length;
    const across = Math.abs((door.x - edge.x1) * dy - (door.y - edge.y1) * dx) / length;
    if (along < 0 || along > length || across > doorwaySnapMeters) continue;
    gaps.push([along - half, along + half]);
  }
  gaps.sort((a, b) => a[0] - b[0]);

  const piece = (from: number, to: number): WallSegment => ({
    x1: edge.x1 + (dx * from) / length,
    y1: edge.y1 + (dy * from) / length,
    x2: edge.x1 + (dx * to) / length,
    y2: edge.y1 + (dy * to) / length,
  });
  const pieces: WallSegment[] = [];
  let from = 0;
  for (const [gapStart, gapEnd] of gaps) {
    if (gapStart > from) pieces.push(piece(from, gapStart));
    from = Math.max(from, gapEnd);
  }
  if (from < length) pieces.push(piece(from, length));
  return pieces;
}

export function constrainMovement(
  start: ScenePoint,
  end: ScenePoint,
  walls: readonly WallSegment[],
  world?: SceneWorldBounds,
): MovementConstraintResult {
  const clampedEnd = clampPointToWorld(end, world);
  const hit = firstWallIntersection(start, clampedEnd, walls);

  if (!hit) {
    return { blocked: false, ...clampedEnd };
  }

  const slide = slideAlongWall(start, clampedEnd, hit.wall, world);

  if (!firstWallIntersection(start, slide, walls)) {
    return { blocked: true, ...slide };
  }

  return { blocked: true, ...clampPointToWorld(start, world) };
}

export function clampPointToWorld(
  point: ScenePoint,
  world?: SceneWorldBounds,
): ScenePoint {
  if (!world) {
    return point;
  }

  return {
    x: clamp(point.x, 0, world.width),
    y: clamp(point.y, 0, world.height),
  };
}

function firstWallIntersection(
  start: ScenePoint,
  end: ScenePoint,
  walls: readonly WallSegment[],
) {
  let earliest:
    | {
        t: number;
        wall: WallSegment;
      }
    | undefined;

  for (const wall of walls) {
    const hit = segmentIntersectionParameter(start, end, wall);

    if (hit === undefined) {
      continue;
    }

    if (!earliest || hit < earliest.t) {
      earliest = { t: hit, wall };
    }
  }

  return earliest;
}

function segmentIntersectionParameter(
  start: ScenePoint,
  end: ScenePoint,
  wall: WallSegment,
) {
  const rayX = end.x - start.x;
  const rayY = end.y - start.y;
  const wallX = wall.x2 - wall.x1;
  const wallY = wall.y2 - wall.y1;
  const denominator = cross(rayX, rayY, wallX, wallY);

  if (Math.abs(denominator) < intersectionEpsilon) {
    return undefined;
  }

  const offsetX = wall.x1 - start.x;
  const offsetY = wall.y1 - start.y;
  const t = cross(offsetX, offsetY, wallX, wallY) / denominator;
  const u = cross(offsetX, offsetY, rayX, rayY) / denominator;
  // Ignore a wall the agent is already standing on (so it can always step away
  // from it), measured as a distance rather than as a fraction of the step. The
  // fraction (2% of a step) let an agent that had crept to within ~3 mm walk
  // straight through a solid wall, which is how shoppers ended up in rooms they
  // could never leave.
  const rayLength = Math.hypot(rayX, rayY);
  const minT = rayLength > 0 ? contactEpsilonMeters / rayLength : 0;

  if (t > minT && t <= 1 && u >= 0 && u <= 1) {
    return t;
  }

  return undefined;
}

function slideAlongWall(
  start: ScenePoint,
  end: ScenePoint,
  wall: WallSegment,
  world?: SceneWorldBounds,
): ScenePoint {
  const moveX = end.x - start.x;
  const moveY = end.y - start.y;
  const wallX = wall.x2 - wall.x1;
  const wallY = wall.y2 - wall.y1;
  const wallLength = Math.hypot(wallX, wallY);

  if (wallLength <= intersectionEpsilon) {
    return clampPointToWorld(start, world);
  }

  const tangentX = wallX / wallLength;
  const tangentY = wallY / wallLength;
  const projectedDistance = moveX * tangentX + moveY * tangentY;

  return clampPointToWorld(
    {
      x: start.x + tangentX * projectedDistance,
      y: start.y + tangentY * projectedDistance,
    },
    world,
  );
}

function cross(ax: number, ay: number, bx: number, by: number) {
  return ax * by - ay * bx;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
