import type { EditorDocument } from "./sceneEditorState";
import type { EditorZoneCategory } from "./sceneEditorState";

export type RoadNumberField =
  | "capacityPerMinute"
  | "speedLimitMetersPerSecond"
  | "vehicleArrivalRatePerMinute"
  | "vehicleSpeedLimitMetersPerSecond"
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
export type CrosswalkNumberField = "widthMeters";
export type TrafficSignalNumberField = "greenSeconds" | "offsetSeconds" | "redSeconds";
/**
 * Entrances were the one drawable object with no parameter editor at all: you
 * could place a door and then had no way to say how many people come through
 * it. Arrival rate is the single most consequential input in a crowd model, so
 * it was the one number a user could not change without hand-editing JSON.
 */
export type EntranceNumberField = "arrivalRatePerMinute" | "groupShare" | "width";
export type HazardNumberField =
  | "growthSeconds"
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
  const minValue =
    field === "capacityPerMinute" || field === "vehicleArrivalRatePerMinute" ? 0 : 0.1;

  return {
    ...document,
    roads: document.roads.map((road) =>
      road.id === roadId ? { ...road, [field]: Math.max(minValue, value) } : road,
    ),
  };
}

export function updateDocumentCrosswalkNumber(
  document: EditorDocument,
  crosswalkId: string,
  field: CrosswalkNumberField,
  value: number,
) {
  return {
    ...document,
    crosswalks: document.crosswalks.map((crosswalk) =>
      crosswalk.id === crosswalkId
        ? { ...crosswalk, [field]: Math.max(0.5, value) }
        : crosswalk,
    ),
  };
}

export function updateDocumentCrosswalkRoadId(
  document: EditorDocument,
  crosswalkId: string,
  roadId: string,
) {
  return {
    ...document,
    crosswalks: document.crosswalks.map((crosswalk) =>
      crosswalk.id === crosswalkId ? { ...crosswalk, roadId } : crosswalk,
    ),
  };
}

export function updateDocumentTrafficSignalNumber(
  document: EditorDocument,
  signalId: string,
  field: TrafficSignalNumberField,
  value: number,
) {
  // greenSeconds/redSeconds must stay positive (trafficSignalSchema's own
  // .positive()) or the signal would never change phase; offsetSeconds only
  // needs to stay nonnegative (.nonnegative()).
  const minValue = field === "offsetSeconds" ? 0 : 1;
  return {
    ...document,
    trafficSignals: document.trafficSignals.map((signal) =>
      signal.id === signalId
        ? { ...signal, [field]: Math.max(minValue, value) }
        : signal,
    ),
  };
}

export function updateDocumentTrafficSignalRoadId(
  document: EditorDocument,
  signalId: string,
  roadId: string,
) {
  return {
    ...document,
    trafficSignals: document.trafficSignals.map((signal) =>
      signal.id === signalId ? { ...signal, roadId } : signal,
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
  field: "transitOnly" | "vehicleAccessible" | "walkable",
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

/**
 * Name a count line. Empty clears it, so a line can go back to being labelled
 * COUNT rather than carrying a name someone typed by accident.
 */
export function updateDocumentCountLineName(
  document: EditorDocument,
  lineId: string,
  name: string,
) {
  const trimmed = name.trim();
  return {
    ...document,
    countLines: document.countLines.map((line) =>
      line.id === lineId
        ? { ...line, name: trimmed === "" ? undefined : trimmed }
        : line,
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
  const minValue = field === "radiusMeters" ? 1 : field === "growthSeconds" ? 0.1 : 0;
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

/**
 * `nextServicePointId` (ADR-0017, wired into the live decision backend by
 * ADR-0021) as an editable dropdown, not a placeholder — unlike a transit
 * stop's or a hazard's own road/zone reference, which still have no
 * correction UI (`sceneEditorAdders.ts`'s own doc comments name this gap).
 * `undefined` ends the chain here, the same as a service point with no
 * `nextServicePointId` set at all.
 */
export function updateDocumentServicePointNextId(
  document: EditorDocument,
  servicePointId: string,
  nextServicePointId: string | undefined,
) {
  return {
    ...document,
    servicePoints: document.servicePoints.map((servicePoint) =>
      servicePoint.id === servicePointId
        ? { ...servicePoint, nextServicePointId }
        : servicePoint,
    ),
  };
}

/**
 * `outageWindows` as `"start-end, start-end"` text (seconds), the same
 * committed-on-blur text-field convention `updateDocumentEntranceProfile`
 * already uses for `arrivalProfile` — a list is not worth its own add/
 * remove row UI for what is usually zero or one window. A malformed or
 * inverted pair (end not after start) is silently dropped rather than
 * rejected: the same tolerance a mistyped arrival-profile rate already
 * gets, not a new leniency invented for this field.
 */
export function updateDocumentServicePointOutageWindows(
  document: EditorDocument,
  servicePointId: string,
  text: string,
) {
  const outageWindows = text
    .split(/[,，]+/)
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .flatMap((part) => {
      const match = /^(-?[\d.]+)\s*-\s*(-?[\d.]+)$/.exec(part);
      if (!match) return [];
      const startsAtSeconds = Number(match[1]);
      const endsAtSeconds = Number(match[2]);
      return Number.isFinite(startsAtSeconds) &&
        Number.isFinite(endsAtSeconds) &&
        endsAtSeconds > startsAtSeconds
        ? [{ startsAtSeconds, endsAtSeconds }]
        : [];
    });
  return {
    ...document,
    servicePoints: document.servicePoints.map((servicePoint) =>
      servicePoint.id === servicePointId
        ? { ...servicePoint, outageWindows }
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
  const minValue = field === "width" ? 0.5 : 0;
  const maxValue = field === "groupShare" ? 1 : Infinity;

  return {
    ...document,
    entrances: document.entrances.map((entrance) =>
      entrance.id === entranceId
        ? { ...entrance, [field]: Math.min(maxValue, Math.max(minValue, value)) }
        : entrance,
    ),
  };
}

/**
 * Set an entrance's demand profile from comma-separated people-a-minute
 * values, one per slot. Blank clears it (a constant rate again); entries that
 * are not non-negative numbers are dropped.
 */
export function updateDocumentEntranceProfile(
  document: EditorDocument,
  entranceId: string,
  text: string,
) {
  const ratesPerMinute = text
    .split(/[,，\s]+/)
    .filter((part) => part !== "")
    .map(Number)
    .filter((rate) => Number.isFinite(rate) && rate >= 0);
  return {
    ...document,
    entrances: document.entrances.map((entrance) =>
      entrance.id === entranceId
        ? {
            ...entrance,
            arrivalProfile:
              ratesPerMinute.length > 0
                ? {
                    intervalMinutes: entrance.arrivalProfile?.intervalMinutes ?? 15,
                    ratesPerMinute,
                  }
                : undefined,
          }
        : entrance,
    ),
  };
}

/**
 * Each demand-profile slot's length in minutes. `simulationSceneConfig.ts`
 * reads this to compute `intervalSeconds` -- it genuinely drives when the
 * engine advances to the next slot's rate, not just a label -- but the
 * editor only ever wrote the schema's own default (15) when a profile was
 * first created, with no control to change it afterward. A no-op on an
 * entrance with no profile yet: the interval means nothing until there are
 * slots for it to size, the same reason the rate-profile text field itself
 * only appears once a kind other than "sink" is selected.
 */
export function updateDocumentEntranceProfileInterval(
  document: EditorDocument,
  entranceId: string,
  minutes: number,
) {
  return {
    ...document,
    entrances: document.entrances.map((entrance) =>
      entrance.id === entranceId && entrance.arrivalProfile
        ? {
            ...entrance,
            arrivalProfile: {
              ...entrance.arrivalProfile,
              intervalMinutes: Math.max(1, minutes),
            },
          }
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

/** A connector's kind: stairs walked, or an escalator ridden. */
export function updateDocumentConnectorKind(
  document: EditorDocument,
  connectorId: string,
  kind: EditorDocument["connectors"][number]["kind"],
): EditorDocument {
  return {
    ...document,
    connectors: document.connectors.map((connector) =>
      connector.id === connectorId ? { ...connector, kind } : connector,
    ),
  };
}

/** Its clear width, which is how many people a second it can pass. */
export function updateDocumentConnectorWidth(
  document: EditorDocument,
  connectorId: string,
  width: number,
): EditorDocument {
  return {
    ...document,
    connectors: document.connectors.map((connector) =>
      connector.id === connectorId
        ? { ...connector, width: Math.max(0.6, width) }
        : connector,
    ),
  };
}

/** A lift car's own passenger limit. */
export function updateDocumentConnectorCapacity(
  document: EditorDocument,
  connectorId: string,
  capacity: number,
): EditorDocument {
  return {
    ...document,
    connectors: document.connectors.map((connector) =>
      connector.id === connectorId
        ? { ...connector, capacity: Math.max(1, Math.round(capacity)) }
        : connector,
    ),
  };
}

/** Cars sharing a lift's shaft. */
export function updateDocumentConnectorCarCount(
  document: EditorDocument,
  connectorId: string,
  carCount: number,
): EditorDocument {
  return {
    ...document,
    connectors: document.connectors.map((connector) =>
      connector.id === connectorId
        ? { ...connector, carCount: Math.max(1, Math.round(carCount)) }
        : connector,
    ),
  };
}

/** How long a lift car's doors stay open at a stop. */
export function updateDocumentConnectorDoorSeconds(
  document: EditorDocument,
  connectorId: string,
  doorSeconds: number,
): EditorDocument {
  return {
    ...document,
    connectors: document.connectors.map((connector) =>
      connector.id === connectorId
        ? { ...connector, doorSeconds: Math.max(0, doorSeconds) }
        : connector,
    ),
  };
}

/** Both ways, or only the way it was drawn — an escalator runs one way. */
export function toggleDocumentConnectorBidirectional(
  document: EditorDocument,
  connectorId: string,
): EditorDocument {
  return {
    ...document,
    connectors: document.connectors.map((connector) =>
      connector.id === connectorId
        ? { ...connector, bidirectional: !connector.bidirectional }
        : connector,
    ),
  };
}

/** Who comes through a door (ADR-0011). "default" clears it. */
export function updateDocumentEntrancePopulation(
  document: EditorDocument,
  entranceId: string,
  populationId: string,
): EditorDocument {
  return {
    ...document,
    entrances: document.entrances.map((entrance) =>
      entrance.id === entranceId
        ? {
            ...entrance,
            populationId: populationId === "default" ? undefined : populationId,
          }
        : entrance,
    ),
  };
}
