import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";
import {
  compileBioCityRouteGraph,
  estimateBioCityRouteInfluence,
} from "./bioCityRouteGraph";
import { calculateEnvironmentImpact } from "./environmentEffects";

export type RouteCostCell = {
  attractionScore: number;
  cost: number;
  id: string;
  roadId?: string;
  riskScore: number;
  zoneId?: string;
};

export type RouteCostMap = {
  cells: RouteCostCell[];
  environmentFactorIds: string[];
  maxCost: number;
  minCost: number;
};

export function createRouteCostMap(
  scene: CrowdSimScene,
  elapsedSeconds = 0,
): RouteCostMap {
  const environment = calculateEnvironmentImpact(scene, elapsedSeconds);
  const graph = compileBioCityRouteGraph(scene, elapsedSeconds);
  const zoneCells = scene.zones.map((zone) => {
    const attractionScore = attractionForZone(scene, zone.id);
    const centroid = polygonCentroid(zone.geometry.points);
    const localInfluence = estimateBioCityRouteInfluence(
      scene,
      centroid,
      elapsedSeconds,
    );
    const riskScore =
      environment.riskScore + localInfluence.riskScore + (zone.walkable ? 0 : 1);
    const cost =
      (zone.walkable ? 1 : 99) *
      environment.routeCostMultiplier *
      localInfluence.routeCostMultiplier *
      (1 + riskScore) *
      Math.max(0.35, 1 - attractionScore * 0.18);

    return {
      attractionScore: round(attractionScore),
      cost: round(cost),
      id: `cost-${zone.id}`,
      riskScore: round(Math.min(1, riskScore)),
      zoneId: zone.id,
    };
  });
  const roadCells = graph.edges.map((edge) => ({
    attractionScore: 0,
    cost: edge.cost,
    id: `cost-${edge.id}`,
    riskScore: edge.riskScore,
    roadId: edge.sourceId,
  }));
  const cells = [...zoneCells, ...roadCells];

  const costs = cells.map((cell) => cell.cost);

  return {
    cells,
    environmentFactorIds: [...environment.activeFactorIds, ...graph.activeHazardIds],
    maxCost: costs.length > 0 ? Math.max(...costs) : 1,
    minCost: costs.length > 0 ? Math.min(...costs) : 1,
  };
}

export function estimatePointRouteCost(
  scene: CrowdSimScene,
  point: ScenePoint,
  elapsedSeconds = 0,
) {
  const map = createRouteCostMap(scene, elapsedSeconds);
  const containingZone = scene.zones.find((zone) =>
    pointInPolygon(point, zone.geometry.points),
  );

  return (
    (map.cells.find((cell) => cell.zoneId === containingZone?.id)?.cost ??
      calculateEnvironmentImpact(scene, elapsedSeconds).routeCostMultiplier) *
    estimateBioCityRouteInfluence(scene, point, elapsedSeconds).routeCostMultiplier
  );
}

function attractionForZone(scene: CrowdSimScene, zoneId: string) {
  const zoneShops = scene.shops.filter((shop) => shop.zoneId === zoneId);

  if (zoneShops.length === 0) {
    return 0;
  }

  return Math.min(
    1,
    zoneShops.reduce(
      (sum, shop) => sum + shop.attraction * (shop.brand?.brandPower ?? 0.45),
      0,
    ) / zoneShops.length,
  );
}

export function pointInPolygon(point: ScenePoint, polygon: readonly ScenePoint[]) {
  let inside = false;

  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index++
  ) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const intersects =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function polygonCentroid(points: readonly ScenePoint[]): ScenePoint {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function round(value: number) {
  return Number(value.toFixed(4));
}
