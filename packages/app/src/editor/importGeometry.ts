import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";

/**
 * Small geometry helpers every CAD/BIM-style file importer needs, shared
 * between `dxfImport.ts` and `ifcImport.ts` (extracted from the former,
 * which had them as private helpers, once a second real call site existed).
 */

export function dedupeWalls(walls: CrowdSimScene["walls"]): CrowdSimScene["walls"] {
  const seen = new Set<string>();

  return walls.filter((wall) => {
    if (seen.has(wall.id)) {
      return false;
    }

    seen.add(wall.id);
    return true;
  });
}

export function worldContaining(
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

/**
 * The convex hull of a set of 2D points (Andrew's monotone chain), counter-
 * clockwise, no repeated closing point. Used to reduce a wall's projected
 * floor-plan vertices (`ifcImport.ts`) to an outline polygon — exact for the
 * rectangular/box-ish walls that make up the overwhelming majority of real
 * floor plans, an over-approximation for anything concave (an L- or
 * U-shaped wall footprint would hull to its bounding convexity), which is a
 * disclosed simplification, not a claim of exactness for every shape.
 */
export function convexHull2D(points: readonly ScenePoint[]): ScenePoint[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) return sorted;

  const cross = (o: ScenePoint, a: ScenePoint, b: ScenePoint) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: ScenePoint[] = [];
  for (const point of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: ScenePoint[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}
