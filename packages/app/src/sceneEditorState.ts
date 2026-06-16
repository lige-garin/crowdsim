import {
  parseScene,
  type CrowdSimScene,
  type ScenePoint,
} from "@crowdsim/scene-schema";

export type EditorTool =
  | "select"
  | "road"
  | "zone"
  | "wall"
  | "building"
  | "source"
  | "sink"
  | "target"
  | "shop"
  | "transitStop"
  | "counter"
  | "gate"
  | "obstacle"
  | "hazard"
  | "countLine";

export type EditorWall = {
  id: string;
  points: ScenePoint[];
};

export type EditorEntrance = {
  id: string;
  kind: "source" | "sink";
  position: ScenePoint;
  width: number;
};

export type EditorTarget = {
  id: string;
  position: ScenePoint;
  radius: number;
};

type EditorShopBrand = NonNullable<CrowdSimScene["shops"][number]["brand"]>;
export type EditorZoneCategory = CrowdSimScene["zones"][number]["category"];

export type EditorZone = {
  id: string;
  attraction: number;
  category: EditorZoneCategory;
  dwellMeanSeconds: number;
  name?: string;
  points: ScenePoint[];
  walkable: boolean;
};

export type EditorShop = {
  id: string;
  brand?: EditorShopBrand;
  name?: string;
  position: ScenePoint;
  size: {
    width: number;
    height: number;
  };
  attraction: number;
  capacity: number;
  dwellMeanSeconds: number;
};

export type EditorServicePoint = {
  id: string;
  kind: "counter" | "gate";
  position: ScenePoint;
  width: number;
  serviceMeanSeconds: number;
  capacityPerMinute: number;
};

export type EditorCountLine = {
  id: string;
  points: [ScenePoint, ScenePoint];
};

type EditorRoadDirection = CrowdSimScene["roads"][number]["direction"];
type EditorBuildingKind = CrowdSimScene["buildings"][number]["kind"];
type EditorTransitStopKind = CrowdSimScene["transitStops"][number]["kind"];
type EditorObstacleKind = CrowdSimScene["obstacles"][number]["kind"];
type EditorHazardKind = CrowdSimScene["hazards"][number]["kind"];

export type EditorRoad = {
  id: string;
  name?: string;
  points: ScenePoint[];
  widthMeters: number;
  direction: EditorRoadDirection;
  speedLimitMetersPerSecond: number;
  capacityPerMinute: number;
  walkable: boolean;
  transitOnly: boolean;
};

export type EditorBuilding = {
  id: string;
  name?: string;
  kind: EditorBuildingKind;
  points: ScenePoint[];
  entrancePosition?: ScenePoint;
  heightMeters: number;
  floors: number;
  residentCapacity: number;
  workerCapacity: number;
  visitorCapacity: number;
};

export type EditorTransitStop = {
  id: string;
  name?: string;
  roadId?: string;
  kind: EditorTransitStopKind;
  position: ScenePoint;
  capacity: number;
  arrivalIntervalSeconds: number;
  alightingPerArrival: number;
  boardingCapacityPerMinute: number;
  delayFactor: number;
  active: boolean;
};

export type EditorObstacle = {
  id: string;
  name?: string;
  kind: EditorObstacleKind;
  geometryType: "polygon" | "polyline";
  points: ScenePoint[];
  blocksMovement: boolean;
  routeCostMultiplier: number;
};

export type EditorHazard = {
  id: string;
  name?: string;
  kind: EditorHazardKind;
  position: ScenePoint;
  radiusMeters: number;
  affectedRoadId?: string;
  affectedZoneId?: string;
  startsAtSeconds: number;
  endsAtSeconds?: number;
  severity: number;
  speedMultiplier: number;
  visibilityMultiplier: number;
  routeCostMultiplier: number;
  riskScore: number;
};

export type EditorDocument = {
  buildings: EditorBuilding[];
  countLines: EditorCountLine[];
  entrances: EditorEntrance[];
  hazards: EditorHazard[];
  nextId: number;
  obstacles: EditorObstacle[];
  roads: EditorRoad[];
  servicePoints: EditorServicePoint[];
  shops: EditorShop[];
  targets: EditorTarget[];
  transitStops: EditorTransitStop[];
  walls: EditorWall[];
  zones: EditorZone[];
};

export function createEditorDocumentFromScene(scene: CrowdSimScene): EditorDocument {
  return {
    buildings: scene.buildings.map((building) => ({
      id: building.id,
      name: building.name,
      kind: building.kind,
      points: building.footprint.points.map((point) => ({ ...point })),
      entrancePosition: building.entrancePosition
        ? { ...building.entrancePosition }
        : undefined,
      heightMeters: building.heightMeters,
      floors: building.floors,
      residentCapacity: building.residentCapacity,
      workerCapacity: building.workerCapacity,
      visitorCapacity: building.visitorCapacity,
    })),
    countLines: scene.countLines.map((line) => ({
      id: line.id,
      points: [{ ...line.geometry.points[0] }, { ...line.geometry.points[1] }],
    })),
    entrances: scene.entrances.flatMap((entrance) =>
      entrance.kind === "bidirectional"
        ? []
        : [
            {
              id: entrance.id,
              kind: entrance.kind,
              position: { ...entrance.position },
              width: entrance.width,
            },
          ],
    ),
    hazards: scene.hazards.map((hazard) => ({
      id: hazard.id,
      name: hazard.name,
      kind: hazard.kind,
      position: { ...hazard.position },
      radiusMeters: hazard.radiusMeters,
      affectedRoadId: hazard.affectedRoadId,
      affectedZoneId: hazard.affectedZoneId,
      startsAtSeconds: hazard.startsAtSeconds,
      endsAtSeconds: hazard.endsAtSeconds,
      severity: hazard.severity,
      speedMultiplier: hazard.speedMultiplier,
      visibilityMultiplier: hazard.visibilityMultiplier,
      routeCostMultiplier: hazard.routeCostMultiplier,
      riskScore: hazard.riskScore,
    })),
    nextId: 1,
    obstacles: scene.obstacles.map((obstacle) => ({
      id: obstacle.id,
      name: obstacle.name,
      kind: obstacle.kind,
      geometryType: obstacle.geometry.type,
      points: obstacle.geometry.points.map((point) => ({ ...point })),
      blocksMovement: obstacle.blocksMovement,
      routeCostMultiplier: obstacle.routeCostMultiplier,
    })),
    roads: scene.roads.map((road) => ({
      id: road.id,
      name: road.name,
      points: road.geometry.points.map((point) => ({ ...point })),
      widthMeters: road.widthMeters,
      direction: road.direction,
      speedLimitMetersPerSecond: road.speedLimitMetersPerSecond,
      capacityPerMinute: road.capacityPerMinute,
      walkable: road.walkable,
      transitOnly: road.transitOnly,
    })),
    servicePoints: scene.servicePoints.map((servicePoint) => ({
      id: servicePoint.id,
      kind: servicePoint.kind,
      position: { ...servicePoint.position },
      width: servicePoint.width,
      serviceMeanSeconds: servicePoint.serviceMeanSeconds,
      capacityPerMinute: servicePoint.capacityPerMinute,
    })),
    zones: scene.zones.map((zone) => ({
      id: zone.id,
      attraction: zone.attraction,
      category: zone.category,
      dwellMeanSeconds: zone.dwellMeanSeconds,
      name: zone.name,
      points: zone.geometry.points.map((point) => ({ ...point })),
      walkable: zone.walkable,
    })),
    shops: scene.shops.map((shop) => ({
      id: shop.id,
      brand: copyBrand(shop.brand),
      name: shop.name,
      position: { ...shop.position },
      size: { ...shop.size },
      attraction: shop.attraction,
      capacity: shop.capacity,
      dwellMeanSeconds: shop.dwellMeanSeconds,
    })),
    targets: scene.targets.map((target) => ({
      id: target.id,
      position: { ...target.position },
      radius: target.radius,
    })),
    transitStops: scene.transitStops.map((stop) => ({
      id: stop.id,
      name: stop.name,
      roadId: stop.roadId,
      kind: stop.kind,
      position: { ...stop.position },
      capacity: stop.capacity,
      arrivalIntervalSeconds: stop.arrivalIntervalSeconds,
      alightingPerArrival: stop.alightingPerArrival,
      boardingCapacityPerMinute: stop.boardingCapacityPerMinute,
      delayFactor: stop.delayFactor,
      active: stop.active,
    })),
    walls: scene.walls.map((wall) => ({
      id: wall.id,
      points: wall.geometry.points.map((point) => ({ ...point })),
    })),
  };
}

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

export function addRoad(
  document: EditorDocument,
  position: ScenePoint,
): EditorDocument {
  return {
    ...document,
    nextId: document.nextId + 1,
    roads: [
      ...document.roads,
      {
        id: `road-${document.nextId}`,
        points: [
          { x: position.x - 10, y: position.y },
          { x: position.x + 10, y: position.y },
        ],
        widthMeters: 6,
        direction: "twoWay",
        speedLimitMetersPerSecond: 1.4,
        capacityPerMinute: 180,
        walkable: true,
        transitOnly: false,
      },
    ],
  };
}

export function addWall(
  document: EditorDocument,
  points: ScenePoint[],
): EditorDocument {
  return {
    ...document,
    nextId: document.nextId + 1,
    walls: [
      ...document.walls,
      {
        id: `wall-${document.nextId}`,
        points: points.map((point) => ({ ...point })),
      },
    ],
  };
}

export function addBuilding(
  document: EditorDocument,
  position: ScenePoint,
): EditorDocument {
  return {
    ...document,
    nextId: document.nextId + 1,
    buildings: [
      ...document.buildings,
      {
        id: `building-${document.nextId}`,
        kind: "mixedUse",
        points: rectangleAround(position, 16, 10),
        entrancePosition: { x: position.x, y: position.y + 5 },
        heightMeters: 18,
        floors: 5,
        residentCapacity: 0,
        workerCapacity: 80,
        visitorCapacity: 120,
      },
    ],
  };
}

export function addEntrance(
  document: EditorDocument,
  kind: EditorEntrance["kind"],
  position: ScenePoint,
): EditorDocument {
  return {
    ...document,
    entrances: [
      ...document.entrances,
      {
        id: `${kind}-${document.nextId}`,
        kind,
        position: { ...position },
        width: kind === "source" ? 4 : 5,
      },
    ],
    nextId: document.nextId + 1,
  };
}

export function addTarget(
  document: EditorDocument,
  position: ScenePoint,
): EditorDocument {
  return {
    ...document,
    nextId: document.nextId + 1,
    targets: [
      ...document.targets,
      {
        id: `target-${document.nextId}`,
        position: { ...position },
        radius: 1,
      },
    ],
  };
}

export function addZone(
  document: EditorDocument,
  position: ScenePoint,
): EditorDocument {
  return {
    ...document,
    nextId: document.nextId + 1,
    zones: [
      ...document.zones,
      {
        id: `zone-${document.nextId}`,
        attraction: 0.5,
        category: "mixed",
        dwellMeanSeconds: 180,
        points: rectangleAround(position, 18, 10),
        walkable: true,
      },
    ],
  };
}

export function addShop(
  document: EditorDocument,
  position: ScenePoint,
): EditorDocument {
  return {
    ...document,
    nextId: document.nextId + 1,
    shops: [
      ...document.shops,
      {
        id: `shop-${document.nextId}`,
        position: { ...position },
        size: {
          width: 8,
          height: 5,
        },
        attraction: 1,
        capacity: 12,
        dwellMeanSeconds: 240,
      },
    ],
  };
}

export function addTransitStop(
  document: EditorDocument,
  position: ScenePoint,
): EditorDocument {
  return {
    ...document,
    nextId: document.nextId + 1,
    transitStops: [
      ...document.transitStops,
      {
        id: `transit-stop-${document.nextId}`,
        roadId: document.roads.at(-1)?.id,
        kind: "bus",
        position: { ...position },
        capacity: 80,
        arrivalIntervalSeconds: 300,
        alightingPerArrival: 24,
        boardingCapacityPerMinute: 60,
        delayFactor: 1,
        active: true,
      },
    ],
  };
}

export function addServicePoint(
  document: EditorDocument,
  kind: EditorServicePoint["kind"],
  position: ScenePoint,
): EditorDocument {
  return {
    ...document,
    nextId: document.nextId + 1,
    servicePoints: [
      ...document.servicePoints,
      {
        id: `${kind}-${document.nextId}`,
        kind,
        position: { ...position },
        width: kind === "gate" ? 4 : 3,
        serviceMeanSeconds: kind === "gate" ? 8 : 30,
        capacityPerMinute: kind === "gate" ? 120 : 30,
      },
    ],
  };
}

export function addObstacle(
  document: EditorDocument,
  position: ScenePoint,
): EditorDocument {
  return {
    ...document,
    nextId: document.nextId + 1,
    obstacles: [
      ...document.obstacles,
      {
        id: `obstacle-${document.nextId}`,
        kind: "constructionBarrier",
        geometryType: "polyline",
        points: [
          { x: position.x - 5, y: position.y },
          { x: position.x + 5, y: position.y },
        ],
        blocksMovement: true,
        routeCostMultiplier: 4,
      },
    ],
  };
}

export function addHazard(
  document: EditorDocument,
  position: ScenePoint,
): EditorDocument {
  return {
    ...document,
    nextId: document.nextId + 1,
    hazards: [
      ...document.hazards,
      {
        id: `hazard-${document.nextId}`,
        kind: "roadClosure",
        position: { ...position },
        radiusMeters: 8,
        affectedRoadId: document.roads.at(-1)?.id,
        startsAtSeconds: 0,
        severity: 0.5,
        speedMultiplier: 0.6,
        visibilityMultiplier: 0.8,
        routeCostMultiplier: 2,
        riskScore: 0.3,
      },
    ],
  };
}

export function addCountLine(
  document: EditorDocument,
  position: ScenePoint,
): EditorDocument {
  return {
    ...document,
    countLines: [
      ...document.countLines,
      {
        id: `count-line-${document.nextId}`,
        points: [
          { ...position },
          {
            x: position.x + 8,
            y: position.y,
          },
        ],
      },
    ],
    nextId: document.nextId + 1,
  };
}

export function moveEntity(
  document: EditorDocument,
  id: string,
  delta: ScenePoint,
): EditorDocument {
  return {
    ...document,
    buildings: document.buildings.map((building) =>
      building.id === id
        ? {
            ...building,
            points: building.points.map((point) => translatePoint(point, delta)),
            entrancePosition: building.entrancePosition
              ? translatePoint(building.entrancePosition, delta)
              : undefined,
          }
        : building,
    ),
    entrances: document.entrances.map((entrance) =>
      entrance.id === id
        ? {
            ...entrance,
            position: translatePoint(entrance.position, delta),
          }
        : entrance,
    ),
    hazards: document.hazards.map((hazard) =>
      hazard.id === id
        ? {
            ...hazard,
            position: translatePoint(hazard.position, delta),
          }
        : hazard,
    ),
    obstacles: document.obstacles.map((obstacle) =>
      obstacle.id === id
        ? {
            ...obstacle,
            points: obstacle.points.map((point) => translatePoint(point, delta)),
          }
        : obstacle,
    ),
    roads: document.roads.map((road) =>
      road.id === id
        ? {
            ...road,
            points: road.points.map((point) => translatePoint(point, delta)),
          }
        : road,
    ),
    countLines: document.countLines.map((line) =>
      line.id === id
        ? {
            ...line,
            points: line.points.map((point) => translatePoint(point, delta)) as [
              ScenePoint,
              ScenePoint,
            ],
          }
        : line,
    ),
    servicePoints: document.servicePoints.map((servicePoint) =>
      servicePoint.id === id
        ? {
            ...servicePoint,
            position: translatePoint(servicePoint.position, delta),
          }
        : servicePoint,
    ),
    shops: document.shops.map((shop) =>
      shop.id === id
        ? {
            ...shop,
            position: translatePoint(shop.position, delta),
          }
        : shop,
    ),
    targets: document.targets.map((target) =>
      target.id === id
        ? {
            ...target,
            position: translatePoint(target.position, delta),
          }
        : target,
    ),
    transitStops: document.transitStops.map((stop) =>
      stop.id === id
        ? {
            ...stop,
            position: translatePoint(stop.position, delta),
          }
        : stop,
    ),
    zones: document.zones.map((zone) =>
      zone.id === id
        ? {
            ...zone,
            points: zone.points.map((point) => translatePoint(point, delta)),
          }
        : zone,
    ),
    walls: document.walls.map((wall) =>
      wall.id === id
        ? {
            ...wall,
            points: wall.points.map((point) => translatePoint(point, delta)),
          }
        : wall,
    ),
  };
}

export function removeEntity(document: EditorDocument, id: string): EditorDocument {
  return {
    ...document,
    buildings: document.buildings.filter((building) => building.id !== id),
    countLines: document.countLines.filter((line) => line.id !== id),
    entrances: document.entrances.filter((entrance) => entrance.id !== id),
    hazards: document.hazards.filter((hazard) => hazard.id !== id),
    obstacles: document.obstacles.filter((obstacle) => obstacle.id !== id),
    roads: document.roads.filter((road) => road.id !== id),
    servicePoints: document.servicePoints.filter(
      (servicePoint) => servicePoint.id !== id,
    ),
    shops: document.shops.filter((shop) => shop.id !== id),
    targets: document.targets.filter((target) => target.id !== id),
    transitStops: document.transitStops.filter((stop) => stop.id !== id),
    walls: document.walls.filter((wall) => wall.id !== id),
    zones: document.zones.filter((zone) => zone.id !== id),
  };
}

export function createSceneFromEditorDocument(
  baseScene: CrowdSimScene,
  document: EditorDocument,
): CrowdSimScene {
  return parseScene({
    ...baseScene,
    roads: document.roads.map((road) => ({
      id: road.id,
      name: road.name,
      geometry: {
        type: "polyline",
        points: road.points.map((point) => ({ ...point })),
      },
      widthMeters: road.widthMeters,
      direction: road.direction,
      speedLimitMetersPerSecond: road.speedLimitMetersPerSecond,
      capacityPerMinute: road.capacityPerMinute,
      walkable: road.walkable,
      transitOnly: road.transitOnly,
    })),
    walls: document.walls.map((wall) => ({
      id: wall.id,
      geometry: {
        type: "polyline",
        points: wall.points.map((point) => ({ ...point })),
      },
      thickness: 0.2,
    })),
    entrances: document.entrances.map((entrance) => ({
      id: entrance.id,
      kind: entrance.kind,
      position: { ...entrance.position },
      width: entrance.width,
      arrivalRatePerMinute: entrance.kind === "source" ? 120 : 0,
    })),
    targets: document.targets.map((target) => ({
      id: target.id,
      position: { ...target.position },
      radius: target.radius,
    })),
    zones: document.zones.map((zone) => ({
      id: zone.id,
      attraction: zone.attraction,
      category: zone.category,
      dwellMeanSeconds: zone.dwellMeanSeconds,
      geometry: {
        type: "polygon",
        points: zone.points.map((point) => ({ ...point })),
      },
      name: zone.name,
      walkable: zone.walkable,
    })),
    buildings: document.buildings.map((building) => ({
      id: building.id,
      name: building.name,
      kind: building.kind,
      footprint: {
        type: "polygon",
        points: building.points.map((point) => ({ ...point })),
      },
      entrancePosition: building.entrancePosition
        ? { ...building.entrancePosition }
        : undefined,
      heightMeters: building.heightMeters,
      floors: building.floors,
      residentCapacity: building.residentCapacity,
      workerCapacity: building.workerCapacity,
      visitorCapacity: building.visitorCapacity,
    })),
    shops: document.shops.map((shop) => ({
      id: shop.id,
      brand: copyBrand(shop.brand),
      name: shop.name,
      position: { ...shop.position },
      size: { ...shop.size },
      attraction: shop.attraction,
      capacity: shop.capacity,
      dwellMeanSeconds: shop.dwellMeanSeconds,
    })),
    servicePoints: document.servicePoints.map((servicePoint) => ({
      id: servicePoint.id,
      kind: servicePoint.kind,
      position: { ...servicePoint.position },
      width: servicePoint.width,
      serviceMeanSeconds: servicePoint.serviceMeanSeconds,
      capacityPerMinute: servicePoint.capacityPerMinute,
    })),
    transitStops: document.transitStops.map((stop) => ({
      id: stop.id,
      name: stop.name,
      roadId: stop.roadId,
      kind: stop.kind,
      position: { ...stop.position },
      capacity: stop.capacity,
      arrivalIntervalSeconds: stop.arrivalIntervalSeconds,
      alightingPerArrival: stop.alightingPerArrival,
      boardingCapacityPerMinute: stop.boardingCapacityPerMinute,
      delayFactor: stop.delayFactor,
      active: stop.active,
    })),
    obstacles: document.obstacles.map((obstacle) => ({
      id: obstacle.id,
      name: obstacle.name,
      kind: obstacle.kind,
      geometry: {
        type: obstacle.geometryType,
        points: obstacle.points.map((point) => ({ ...point })),
      },
      blocksMovement: obstacle.blocksMovement,
      routeCostMultiplier: obstacle.routeCostMultiplier,
    })),
    hazards: document.hazards.map((hazard) => ({
      id: hazard.id,
      name: hazard.name,
      kind: hazard.kind,
      position: { ...hazard.position },
      radiusMeters: hazard.radiusMeters,
      affectedRoadId: hazard.affectedRoadId,
      affectedZoneId: hazard.affectedZoneId,
      startsAtSeconds: hazard.startsAtSeconds,
      endsAtSeconds: hazard.endsAtSeconds,
      severity: hazard.severity,
      speedMultiplier: hazard.speedMultiplier,
      visibilityMultiplier: hazard.visibilityMultiplier,
      routeCostMultiplier: hazard.routeCostMultiplier,
      riskScore: hazard.riskScore,
    })),
    countLines: document.countLines.map((line) => ({
      id: line.id,
      geometry: {
        type: "polyline",
        points: line.points.map((point) => ({ ...point })),
      },
    })),
  });
}

function copyBrand(brand?: EditorShopBrand) {
  return brand
    ? {
        ...brand,
        personaAffinity: { ...brand.personaAffinity },
      }
    : undefined;
}

function translatePoint(point: ScenePoint, delta: ScenePoint): ScenePoint {
  return {
    x: point.x + delta.x,
    y: point.y + delta.y,
  };
}

function rectangleAround(
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
