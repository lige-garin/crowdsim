import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";
import { getActiveCityEvents } from "./bioCityWeatherSystem";

export type BioCityRouteNodeKind =
  | "buildingEntrance"
  | "entrance"
  | "roadEndpoint"
  | "target"
  | "transitStop";

export type BioCityRouteNode = {
  id: string;
  kind: BioCityRouteNodeKind;
  position: ScenePoint;
  sourceId: string;
};

export type BioCityRouteEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  sourceId: string;
  kind: "road" | "walk";
  distanceMeters: number;
  cost: number;
  riskScore: number;
  speedMultiplier: number;
  routeCostMultiplier: number;
};

export type BioCityWalkableSpace = {
  id: string;
  kind: "area" | "zone";
  sourceId: string;
  walkable: boolean;
  points: ScenePoint[];
};

export type BioCityBlockedSpace = {
  id: string;
  kind: "hazard" | "obstacle" | "zone";
  sourceId: string;
  points: ScenePoint[];
  routeCostMultiplier: number;
  riskScore: number;
};

export type BioCityRouteGraph = {
  activeHazardIds: string[];
  blockedSpaces: BioCityBlockedSpace[];
  edges: BioCityRouteEdge[];
  nodes: BioCityRouteNode[];
  walkableSpaces: BioCityWalkableSpace[];
};

type RouteInfluence = {
  routeCostMultiplier: number;
  riskScore: number;
  speedMultiplier: number;
};

export function compileBioCityRouteGraph(
  scene: CrowdSimScene,
  elapsedSeconds = 0,
): BioCityRouteGraph {
  const activeHazards = scene.hazards.filter((hazard) =>
    isHazardActive(hazard, elapsedSeconds),
  );
  const activeEvents = getActiveCityEvents(scene, elapsedSeconds);
  const nodes: BioCityRouteNode[] = [
    ...routeNodesFromRoads(scene),
    ...routeNodesFromEntrances(scene),
    ...routeNodesFromTargets(scene),
    ...routeNodesFromBuildings(scene),
    ...routeNodesFromTransitStops(scene),
  ];
  const edges = routeEdgesFromRoads(scene, activeHazards, activeEvents);

  return {
    activeHazardIds: activeHazards.map((hazard) => hazard.id),
    blockedSpaces: [
      ...blockedSpacesFromZones(scene),
      ...blockedSpacesFromObstacles(scene),
      ...blockedSpacesFromHazards(activeHazards),
    ],
    edges,
    nodes,
    walkableSpaces: [
      ...scene.areas.map((area) => ({
        id: `space-${area.id}`,
        kind: "area" as const,
        points: area.geometry.points.map(copyPoint),
        sourceId: area.id,
        walkable: area.kind === "walkable",
      })),
      ...scene.zones.map((zone) => ({
        id: `space-${zone.id}`,
        kind: "zone" as const,
        points: zone.geometry.points.map(copyPoint),
        sourceId: zone.id,
        walkable: zone.walkable,
      })),
    ],
  };
}

export function estimateBioCityRouteInfluence(
  scene: CrowdSimScene,
  point: ScenePoint,
  elapsedSeconds = 0,
): RouteInfluence {
  const activeHazards = scene.hazards.filter((hazard) =>
    isHazardActive(hazard, elapsedSeconds),
  );
  const hazardInfluence = activeHazards
    .filter((hazard) => distance(point, hazard.position) <= hazard.radiusMeters)
    .reduce<RouteInfluence>(
      (influence, hazard) => ({
        routeCostMultiplier: influence.routeCostMultiplier * hazard.routeCostMultiplier,
        riskScore: Math.min(1, influence.riskScore + hazard.riskScore),
        speedMultiplier: influence.speedMultiplier * hazard.speedMultiplier,
      }),
      { riskScore: 0, routeCostMultiplier: 1, speedMultiplier: 1 },
    );
  const obstacleInfluence = scene.obstacles
    .filter((obstacle) => obstacle.blocksMovement && pointNearGeometry(point, obstacle))
    .reduce((multiplier, obstacle) => multiplier * obstacle.routeCostMultiplier, 1);
  const blockedZone = scene.zones.find(
    (zone) => !zone.walkable && pointInPolygon(point, zone.geometry.points),
  );

  return {
    routeCostMultiplier:
      hazardInfluence.routeCostMultiplier * obstacleInfluence * (blockedZone ? 99 : 1),
    riskScore: Math.min(1, hazardInfluence.riskScore + (blockedZone ? 1 : 0)),
    speedMultiplier: hazardInfluence.speedMultiplier,
  };
}

export function nearestBioCityRouteNode(graph: BioCityRouteGraph, point: ScenePoint) {
  return graph.nodes.reduce<BioCityRouteNode | undefined>((best, node) => {
    if (!best) {
      return node;
    }

    return distance(point, node.position) < distance(point, best.position)
      ? node
      : best;
  }, undefined);
}

function routeNodesFromRoads(scene: CrowdSimScene): BioCityRouteNode[] {
  return scene.roads.flatMap((road) =>
    road.geometry.points.map((point, index) => ({
      id: `node-${road.id}-${index}`,
      kind: "roadEndpoint" as const,
      position: copyPoint(point),
      sourceId: road.id,
    })),
  );
}

function routeNodesFromEntrances(scene: CrowdSimScene): BioCityRouteNode[] {
  return scene.entrances.map((entrance) => ({
    id: `node-${entrance.id}`,
    kind: "entrance",
    position: copyPoint(entrance.position),
    sourceId: entrance.id,
  }));
}

function routeNodesFromTargets(scene: CrowdSimScene): BioCityRouteNode[] {
  return scene.targets.map((target) => ({
    id: `node-${target.id}`,
    kind: "target",
    position: copyPoint(target.position),
    sourceId: target.id,
  }));
}

function routeNodesFromBuildings(scene: CrowdSimScene): BioCityRouteNode[] {
  return scene.buildings.flatMap((building) =>
    building.entrancePosition
      ? [
          {
            id: `node-${building.id}-entrance`,
            kind: "buildingEntrance" as const,
            position: copyPoint(building.entrancePosition),
            sourceId: building.id,
          },
        ]
      : [],
  );
}

function routeNodesFromTransitStops(scene: CrowdSimScene): BioCityRouteNode[] {
  return scene.transitStops.map((stop) => ({
    id: `node-${stop.id}`,
    kind: "transitStop",
    position: copyPoint(stop.position),
    sourceId: stop.id,
  }));
}

function routeEdgesFromRoads(
  scene: CrowdSimScene,
  activeHazards: CrowdSimScene["hazards"],
  activeEvents: CrowdSimScene["eventTimeline"]["events"],
): BioCityRouteEdge[] {
  return scene.roads.flatMap((road) => {
    const roadClosed = activeEvents.some(
      (event) => event.kind === "roadClose" && event.targetId === road.id,
    );
    const roadHazards = activeHazards.filter(
      (hazard) =>
        hazard.affectedRoadId === road.id ||
        road.geometry.points.some(
          (point) => distance(point, hazard.position) <= hazard.radiusMeters,
        ),
    );
    const hazardImpact = roadHazards.reduce<RouteInfluence>(
      (influence, hazard) => ({
        routeCostMultiplier: influence.routeCostMultiplier * hazard.routeCostMultiplier,
        riskScore: Math.min(1, influence.riskScore + hazard.riskScore),
        speedMultiplier: influence.speedMultiplier * hazard.speedMultiplier,
      }),
      { riskScore: 0, routeCostMultiplier: 1, speedMultiplier: 1 },
    );

    return road.geometry.points.slice(1).map((point, index) => {
      const from = road.geometry.points[index];
      const distanceMeters = distance(from, point);
      const routeCostMultiplier =
        (road.walkable ? 1 : 99) *
        (roadClosed ? 99 : 1) *
        (road.transitOnly ? 1.25 : 1) *
        hazardImpact.routeCostMultiplier;
      const speedMultiplier = hazardImpact.speedMultiplier;
      const cost =
        (distanceMeters / road.speedLimitMetersPerSecond) *
        routeCostMultiplier *
        (speedMultiplier > 0 ? 1 / speedMultiplier : 99);

      return {
        id: `edge-${road.id}-${index}`,
        cost: round(cost),
        distanceMeters: round(distanceMeters),
        fromNodeId: `node-${road.id}-${index}`,
        kind: "road" as const,
        riskScore: round(hazardImpact.riskScore),
        routeCostMultiplier: round(routeCostMultiplier),
        sourceId: road.id,
        speedMultiplier: round(speedMultiplier),
        toNodeId: `node-${road.id}-${index + 1}`,
      };
    });
  });
}

function blockedSpacesFromZones(scene: CrowdSimScene): BioCityBlockedSpace[] {
  return scene.zones
    .filter((zone) => !zone.walkable)
    .map((zone) => ({
      id: `blocked-${zone.id}`,
      kind: "zone",
      points: zone.geometry.points.map(copyPoint),
      riskScore: 1,
      routeCostMultiplier: 99,
      sourceId: zone.id,
    }));
}

function blockedSpacesFromObstacles(scene: CrowdSimScene): BioCityBlockedSpace[] {
  return scene.obstacles
    .filter((obstacle) => obstacle.blocksMovement)
    .map((obstacle) => ({
      id: `blocked-${obstacle.id}`,
      kind: "obstacle",
      points: obstacle.geometry.points.map(copyPoint),
      riskScore: 0,
      routeCostMultiplier: obstacle.routeCostMultiplier,
      sourceId: obstacle.id,
    }));
}

function blockedSpacesFromHazards(
  hazards: CrowdSimScene["hazards"],
): BioCityBlockedSpace[] {
  return hazards.map((hazard) => ({
    id: `blocked-${hazard.id}`,
    kind: "hazard",
    points: circlePolygon(hazard.position, hazard.radiusMeters, 12),
    riskScore: hazard.riskScore,
    routeCostMultiplier: hazard.routeCostMultiplier,
    sourceId: hazard.id,
  }));
}

function isHazardActive(
  hazard: CrowdSimScene["hazards"][number],
  elapsedSeconds: number,
) {
  return (
    hazard.startsAtSeconds <= elapsedSeconds &&
    (hazard.endsAtSeconds === undefined || hazard.endsAtSeconds >= elapsedSeconds)
  );
}

function pointNearGeometry(
  point: ScenePoint,
  obstacle: CrowdSimScene["obstacles"][number],
) {
  if (
    obstacle.geometry.type === "polygon" &&
    pointInPolygon(point, obstacle.geometry.points)
  ) {
    return true;
  }

  return obstacle.geometry.points.some(
    (obstaclePoint) => distance(point, obstaclePoint) <= 2,
  );
}

function pointInPolygon(point: ScenePoint, polygon: readonly ScenePoint[]) {
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

function circlePolygon(center: ScenePoint, radius: number, sides: number) {
  return Array.from({ length: sides }, (_, index) => {
    const angle = (Math.PI * 2 * index) / sides;

    return {
      x: round(center.x + Math.cos(angle) * radius),
      y: round(center.y + Math.sin(angle) * radius),
    };
  });
}

function copyPoint(point: ScenePoint): ScenePoint {
  return { x: point.x, y: point.y };
}

function distance(left: ScenePoint, right: ScenePoint) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function round(value: number) {
  return Number(value.toFixed(4));
}
