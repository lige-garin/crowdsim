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
