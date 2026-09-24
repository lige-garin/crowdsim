import type { CrowdSimScene } from "@crowdsim/scene-schema";

const viewBoxSize = 100;
const padding = 4;

export type ThumbnailLine = { x1: number; y1: number; x2: number; y2: number };
export type ThumbnailPoint = { x: number; y: number };
export type ThumbnailRect = { x: number; y: number; width: number; height: number };

export type SceneThumbnail = {
  buildings: ThumbnailRect[];
  entrances: ThumbnailPoint[];
  shops: ThumbnailRect[];
  viewBoxSize: number;
  walls: ThumbnailLine[];
};

/**
 * A schematic floor-plan thumbnail for a template card: walls as lines,
 * entrances as points, shops and building footprints as rectangles, scaled
 * from the scene's own `world` bounding box into a fixed square viewBox.
 * This is not the real geometry engine (`sceneGeometry.ts`) -- a
 * glance-sized preview only needs raw coordinates, not collision resolution
 * or floor routing, so it stays a small pure mapping rather than reusing
 * that heavier machinery. `buildings` is the footprint's own bounding box,
 * not the polygon itself, for the same reason -- a thumbnail this small
 * cannot show a footprint's exact silhouette anyway.
 *
 * Only the scene's default floor is drawn (entities with no `floorId`, or
 * whose `floorId` matches the first floor) -- a multi-floor scene's upper
 * levels would otherwise overlap the ground floor in one flat thumbnail,
 * which is misleading rather than merely incomplete.
 */
export function buildSceneThumbnail(scene: CrowdSimScene): SceneThumbnail {
  const baseFloorId = scene.floors[0]?.id;
  const onBaseFloor = (entity: { floorId?: string }) =>
    entity.floorId === undefined || entity.floorId === baseFloorId;

  const scaleX = (viewBoxSize - padding * 2) / scene.world.width;
  const scaleY = (viewBoxSize - padding * 2) / scene.world.height;
  const scale = Math.min(scaleX, scaleY);

  const toX = (x: number) => padding + x * scale;
  const toY = (y: number) => padding + y * scale;

  const walls: ThumbnailLine[] = scene.walls.filter(onBaseFloor).flatMap((wall) => {
    const points = wall.geometry.points;
    const segments: ThumbnailLine[] = [];

    for (let index = 0; index < points.length - 1; index += 1) {
      segments.push({
        x1: toX(points[index].x),
        y1: toY(points[index].y),
        x2: toX(points[index + 1].x),
        y2: toY(points[index + 1].y),
      });
    }

    if (wall.geometry.type === "polygon" && points.length > 2) {
      segments.push({
        x1: toX(points[points.length - 1].x),
        y1: toY(points[points.length - 1].y),
        x2: toX(points[0].x),
        y2: toY(points[0].y),
      });
    }

    return segments;
  });

  const entrances: ThumbnailPoint[] = scene.entrances
    .filter(onBaseFloor)
    .map((entrance) => ({
      x: toX(entrance.position.x),
      y: toY(entrance.position.y),
    }));

  const shops: ThumbnailRect[] = scene.shops.filter(onBaseFloor).map((shop) => ({
    height: shop.size.height * scale,
    width: shop.size.width * scale,
    x: toX(shop.position.x - shop.size.width / 2),
    y: toY(shop.position.y - shop.size.height / 2),
  }));

  const buildings: ThumbnailRect[] = scene.buildings
    .filter(onBaseFloor)
    .map((building) => {
      const points = building.footprint.points;
      const minX = Math.min(...points.map((point) => point.x));
      const maxX = Math.max(...points.map((point) => point.x));
      const minY = Math.min(...points.map((point) => point.y));
      const maxY = Math.max(...points.map((point) => point.y));
      return {
        height: (maxY - minY) * scale,
        width: (maxX - minX) * scale,
        x: toX(minX),
        y: toY(minY),
      };
    });

  return { buildings, entrances, shops, viewBoxSize, walls };
}
