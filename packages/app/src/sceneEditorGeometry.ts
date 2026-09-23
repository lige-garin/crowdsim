import type { ScenePoint } from "@crowdsim/scene-schema";

export function snapPoint(
  point: ScenePoint,
  gridSize: number,
  enabled: boolean,
): ScenePoint {
  if (!enabled) {
    return point;
  }

  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  };
}

export function translatePoint(point: ScenePoint, delta: ScenePoint): ScenePoint {
  return {
    x: point.x + delta.x,
    y: point.y + delta.y,
  };
}

/** Perpendicular distance from `point` to the segment `a`-`b`, clamped to
 * the segment's own ends (a point past either end measures to that end). */
export function distanceToSegment(
  point: ScenePoint,
  a: ScenePoint,
  b: ScenePoint,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared > 0
      ? Math.max(
          0,
          Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared),
        )
      : 0;
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

/** Shortest distance from `point` to any segment of the polyline `points`. */
export function distanceToPolyline(
  point: ScenePoint,
  points: readonly ScenePoint[],
): number {
  let best = Infinity;
  for (let index = 1; index < points.length; index++) {
    best = Math.min(best, distanceToSegment(point, points[index - 1], points[index]));
  }
  return best;
}

export function rectangleAround(
  center: ScenePoint,
  width: number,
  height: number,
): ScenePoint[] {
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  return [
    { x: center.x - halfWidth, y: center.y - halfHeight },
    { x: center.x + halfWidth, y: center.y - halfHeight },
    { x: center.x + halfWidth, y: center.y + halfHeight },
    { x: center.x - halfWidth, y: center.y + halfHeight },
  ];
}
