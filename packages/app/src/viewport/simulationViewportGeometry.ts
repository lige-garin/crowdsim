import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";

export function primitiveBounds(points: readonly ScenePoint[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    center: {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
    },
    height: Math.max(0.4, maxY - minY),
    width: Math.max(0.4, maxX - minX),
  };
}

export function toRenderX(x: number, scene: CrowdSimScene) {
  return x - scene.world.width / 2;
}

export function toRenderY(y: number, scene: CrowdSimScene) {
  return scene.world.height / 2 - y;
}
