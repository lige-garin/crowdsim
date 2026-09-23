import type { ScenePoint } from "@crowdsim/scene-schema";

import { rectangleAround } from "./sceneEditorGeometry";
import { editorFloors } from "./sceneEditorFloors";
import {
  defaultArrivalRatePerMinute,
  type EditorDocument,
  type EditorEntrance,
  type EditorServicePoint,
  type EditorTool,
} from "./sceneEditorTypes";

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
        floorId: document.activeFloorId,
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
        vehicleAccessible: false,
        vehicleArrivalRatePerMinute: 0,
        vehicleSpeedLimitMetersPerSecond: 8.33,
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
        floorId: document.activeFloorId,
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
        floorId: document.activeFloorId,
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
        floorId: document.activeFloorId,
        kind,
        position: { ...position },
        width: kind === "source" ? 4 : 5,
        arrivalRatePerMinute: kind === "sink" ? 0 : defaultArrivalRatePerMinute,
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
        floorId: document.activeFloorId,
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
        floorId: document.activeFloorId,
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
        floorId: document.activeFloorId,
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
        floorId: document.activeFloorId,
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
        floorId: document.activeFloorId,
        kind,
        position: { ...position },
        width: kind === "gate" ? 4 : 3,
        serviceMeanSeconds: kind === "gate" ? 8 : 30,
        capacityPerMinute: kind === "gate" ? 120 : 30,
        outageWindows: [],
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
        floorId: document.activeFloorId,
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
        floorId: document.activeFloorId,
        kind: "roadClosure",
        position: { ...position },
        radiusMeters: 8,
        growthSeconds: 120,
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

/**
 * A count line between two chosen points: what the 2D editor produces when a
 * line is dragged out. `addCountLine` below stays for the 3D world, where a
 * single click has no second point to wait for.
 */
export function addCountLineBetween(
  document: EditorDocument,
  start: ScenePoint,
  end: ScenePoint,
): EditorDocument {
  return {
    ...document,
    countLines: [
      ...document.countLines,
      {
        id: `count-line-${document.nextId}`,
        floorId: document.activeFloorId,
        points: [{ ...start }, { ...end }],
      },
    ],
    nextId: document.nextId + 1,
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
        floorId: document.activeFloorId,
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

/**
 * One click of a single-point tool, as a pure document edit.
 *
 * The 2D editor and the 3D world both place things with a click; sharing this
 * keeps "what a road tool drops" identical in both. Returns null for tools that
 * are not a single click: select picks, and a wall needs a run of points.
 */
/**
 * A staircase at this point, joining the floor being drawn to the one below —
 * or, on the lowest floor, to the one above. Both ends sit at the same plan
 * coordinates, which is what a stair well is; either end can be dragged after.
 *
 * A scene with one floor gets nothing: there is nothing to join, and inventing
 * a floor to connect to would be putting a building the user did not draw into
 * their scene.
 */
export function addConnector(
  document: EditorDocument,
  position: ScenePoint,
): EditorDocument {
  const floors = editorFloors(document);
  const here = floors.findIndex((floor) => floor.id === document.activeFloorId);

  if (floors.length < 2 || here < 0) {
    return document;
  }

  const other = floors[here - 1] ?? floors[here + 1];

  return {
    ...document,
    nextId: document.nextId + 1,
    connectors: [
      ...document.connectors,
      {
        id: `connector-${document.nextId}`,
        kind: "stair",
        // Drawn from the lower floor up, so a one-way escalator made from it
        // runs the way people usually need one.
        fromFloorId: other.level < floors[here].level ? other.id : floors[here].id,
        fromPoint: { ...position },
        toFloorId: other.level < floors[here].level ? floors[here].id : other.id,
        toPoint: { ...position },
        width: 1.2,
        bidirectional: true,
      },
    ],
  };
}

export function placeEditorTool(
  document: EditorDocument,
  tool: EditorTool,
  point: ScenePoint,
): EditorDocument | null {
  switch (tool) {
    case "select":
    case "wall":
      return null;
    case "zone":
      return addZone(document, point);
    case "road":
      return addRoad(document, point);
    case "building":
      return addBuilding(document, point);
    case "source":
    case "sink":
      return addEntrance(document, tool, point);
    case "shop":
      return addShop(document, point);
    case "transitStop":
      return addTransitStop(document, point);
    case "counter":
    case "gate":
      return addServicePoint(document, tool, point);
    case "obstacle":
      return addObstacle(document, point);
    case "hazard":
      return addHazard(document, point);
    case "countLine":
      return addCountLine(document, point);
    case "connector":
      return addConnector(document, point);
    case "target":
      return addTarget(document, point);
  }
}
