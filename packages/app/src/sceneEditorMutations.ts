import type { EditorDocument } from "./sceneEditorState";
import type { EditorZoneCategory } from "./sceneEditorState";

export type RoadNumberField =
  | "capacityPerMinute"
  | "speedLimitMetersPerSecond"
  | "widthMeters";
export type BuildingNumberField =
  | "floors"
  | "heightMeters"
  | "residentCapacity"
  | "visitorCapacity"
  | "workerCapacity";
export type TransitStopNumberField =
  | "alightingPerArrival"
  | "arrivalIntervalSeconds"
  | "boardingCapacityPerMinute"
  | "capacity"
  | "delayFactor";
export type ObstacleNumberField = "routeCostMultiplier";
/**
 * Entrances were the one drawable object with no parameter editor at all: you
 * could place a door and then had no way to say how many people come through
 * it. Arrival rate is the single most consequential input in a crowd model, so
 * it was the one number a user could not change without hand-editing JSON.
 */
export type EntranceNumberField = "arrivalRatePerMinute" | "width";
export type HazardNumberField =
  | "radiusMeters"
  | "riskScore"
  | "routeCostMultiplier"
  | "severity"
  | "speedMultiplier"
  | "startsAtSeconds"
  | "visibilityMultiplier";
export type ShopNumberField = "attraction" | "capacity" | "dwellMeanSeconds";
export type ShopSizeField = "height" | "width";
export type ServiceNumberField = "capacityPerMinute" | "serviceMeanSeconds" | "width";
export type ZoneNumberField = "attraction" | "dwellMeanSeconds";

type RoadDirection = EditorDocument["roads"][number]["direction"];
type BuildingKind = EditorDocument["buildings"][number]["kind"];
type TransitStopKind = EditorDocument["transitStops"][number]["kind"];
type ObstacleKind = EditorDocument["obstacles"][number]["kind"];
type HazardKind = EditorDocument["hazards"][number]["kind"];

export function updateDocumentRoadNumber(
  document: EditorDocument,
  roadId: string,
  field: RoadNumberField,
  value: number,
) {
  const minValue = field === "capacityPerMinute" ? 0 : 0.1;

  return {
    ...document,
    roads: document.roads.map((road) =>
      road.id === roadId ? { ...road, [field]: Math.max(minValue, value) } : road,
    ),
  };
}

export function updateDocumentRoadDirection(
  document: EditorDocument,
  roadId: string,
  direction: RoadDirection,
) {
  return {
    ...document,
    roads: document.roads.map((road) =>
      road.id === roadId ? { ...road, direction } : road,
    ),
  };
}

export function toggleDocumentRoadBoolean(
  document: EditorDocument,
  roadId: string,
  field: "transitOnly" | "walkable",
) {
  return {
    ...document,
    roads: document.roads.map((road) =>
      road.id === roadId ? { ...road, [field]: !road[field] } : road,
    ),
  };
}

export function updateDocumentBuildingKind(
  document: EditorDocument,
  buildingId: string,
  kind: BuildingKind,
) {
  return {
    ...document,
    buildings: document.buildings.map((building) =>
      building.id === buildingId ? { ...building, kind } : building,
    ),
  };
}

export function updateDocumentBuildingNumber(
  document: EditorDocument,
  buildingId: string,
  field: BuildingNumberField,
  value: number,
) {
  const minValue = field === "heightMeters" || field === "floors" ? 1 : 0;
  const nextValue =
    field === "floors" ||
    field === "residentCapacity" ||
    field === "visitorCapacity" ||
    field === "workerCapacity"
      ? Math.round(value)
      : value;

  return {
    ...document,
    buildings: document.buildings.map((building) =>
      building.id === buildingId
        ? { ...building, [field]: Math.max(minValue, nextValue) }
        : building,
    ),
  };
}

export function updateDocumentTransitStopKind(
  document: EditorDocument,
  stopId: string,
  kind: TransitStopKind,
) {
  return {
    ...document,
    transitStops: document.transitStops.map((stop) =>
      stop.id === stopId ? { ...stop, kind } : stop,
    ),
  };
}

export function updateDocumentTransitStopNumber(
  document: EditorDocument,
  stopId: string,
  field: TransitStopNumberField,
  value: number,
) {
  const minValue =
    field === "alightingPerArrival" || field === "boardingCapacityPerMinute" ? 0 : 1;
  const nextValue =
    field === "alightingPerArrival" || field === "capacity" ? Math.round(value) : value;

  return {
    ...document,
    transitStops: document.transitStops.map((stop) =>
      stop.id === stopId ? { ...stop, [field]: Math.max(minValue, nextValue) } : stop,
    ),
  };
}

export function toggleDocumentTransitStopActive(
  document: EditorDocument,
  stopId: string,
) {
  return {
    ...document,
    transitStops: document.transitStops.map((stop) =>
      stop.id === stopId ? { ...stop, active: !stop.active } : stop,
    ),
  };
}

export function updateDocumentObstacleKind(
  document: EditorDocument,
  obstacleId: string,
  kind: ObstacleKind,
) {
  return {
    ...document,
    obstacles: document.obstacles.map((obstacle) =>
      obstacle.id === obstacleId ? { ...obstacle, kind } : obstacle,
    ),
  };
}

export function updateDocumentObstacleNumber(
  document: EditorDocument,
  obstacleId: string,
  field: ObstacleNumberField,
  value: number,
) {
  return {
    ...document,
    obstacles: document.obstacles.map((obstacle) =>
      obstacle.id === obstacleId
        ? { ...obstacle, [field]: Math.max(0, value) }
        : obstacle,
    ),
  };
}

export function toggleDocumentObstacleBlocksMovement(
  document: EditorDocument,
  obstacleId: string,
) {
  return {
    ...document,
    obstacles: document.obstacles.map((obstacle) =>
      obstacle.id === obstacleId
        ? { ...obstacle, blocksMovement: !obstacle.blocksMovement }
        : obstacle,
    ),
  };
}

export function updateDocumentHazardKind(
  document: EditorDocument,
  hazardId: string,
  kind: HazardKind,
) {
  return {
    ...document,
    hazards: document.hazards.map((hazard) =>
      hazard.id === hazardId ? { ...hazard, kind } : hazard,
    ),
  };
}

export function updateDocumentHazardNumber(
  document: EditorDocument,
  hazardId: string,
  field: HazardNumberField,
  value: number,
) {
  const minValue = field === "radiusMeters" ? 1 : 0;
  const maxValue =
    field === "riskScore" || field === "severity" ? 1 : Number.POSITIVE_INFINITY;

  return {
    ...document,
    hazards: document.hazards.map((hazard) =>
      hazard.id === hazardId
        ? { ...hazard, [field]: Math.min(maxValue, Math.max(minValue, value)) }
        : hazard,
    ),
  };
}

export function updateDocumentShopNumber(
  document: EditorDocument,
  shopId: string,
  field: ShopNumberField,
  value: number,
) {
  return {
    ...document,
    shops: document.shops.map((shop) =>
      shop.id === shopId
        ? { ...shop, [field]: Math.max(field === "attraction" ? 0 : 1, value) }
        : shop,
    ),
  };
}

export function updateDocumentShopSize(
  document: EditorDocument,
  shopId: string,
  field: ShopSizeField,
  value: number,
) {
  return {
    ...document,
    shops: document.shops.map((shop) =>
      shop.id === shopId
        ? {
            ...shop,
            size: { ...shop.size, [field]: Math.max(1, value) },
          }
        : shop,
    ),
  };
}

export function updateDocumentServiceNumber(
  document: EditorDocument,
  servicePointId: string,
  field: ServiceNumberField,
  value: number,
) {
  return {
    ...document,
    servicePoints: document.servicePoints.map((servicePoint) =>
      servicePoint.id === servicePointId
        ? {
            ...servicePoint,
            [field]: Math.max(field === "capacityPerMinute" ? 0 : 1, value),
          }
        : servicePoint,
    ),
  };
}

export function updateDocumentZoneCategory(
  document: EditorDocument,
  zoneId: string,
  category: EditorZoneCategory,
) {
  return {
    ...document,
    zones: document.zones.map((zone) =>
      zone.id === zoneId ? { ...zone, category } : zone,
    ),
  };
}

export function updateDocumentZoneNumber(
  document: EditorDocument,
  zoneId: string,
  field: ZoneNumberField,
  value: number,
) {
  return {
    ...document,
    zones: document.zones.map((zone) =>
      zone.id === zoneId
        ? { ...zone, [field]: Math.max(field === "attraction" ? 0 : 1, value) }
        : zone,
    ),
  };
}

export function toggleDocumentZoneWalkable(document: EditorDocument, zoneId: string) {
  return {
    ...document,
    zones: document.zones.map((zone) =>
      zone.id === zoneId ? { ...zone, walkable: !zone.walkable } : zone,
    ),
  };
}

export function updateDocumentEntranceNumber(
  document: EditorDocument,
  entranceId: string,
  field: EntranceNumberField,
  value: number,
) {
  // A sink has no arrival rate, and a door narrower than half a metre is not a
  // door; both are clamped rather than rejected so dragging a field stays live.
  const minValue = field === "arrivalRatePerMinute" ? 0 : 0.5;

  return {
    ...document,
    entrances: document.entrances.map((entrance) =>
      entrance.id === entranceId
        ? { ...entrance, [field]: Math.max(minValue, value) }
        : entrance,
    ),
  };
}

export function updateDocumentEntranceKind(
  document: EditorDocument,
  entranceId: string,
  kind: EditorDocument["entrances"][number]["kind"],
) {
  return {
    ...document,
    entrances: document.entrances.map((entrance) =>
      entrance.id === entranceId
        ? {
            ...entrance,
            kind,
            // A pure exit cannot spawn anyone; keep the document honest rather
            // than carrying a rate that silently does nothing.
            arrivalRatePerMinute:
              kind === "sink" ? 0 : Math.max(1, entrance.arrivalRatePerMinute),
          }
        : entrance,
    ),
  };
}
