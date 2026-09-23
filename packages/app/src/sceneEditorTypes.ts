import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";

export const defaultArrivalRatePerMinute = 120;

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
  | "countLine"
  | "connector";

export const editorTools: readonly EditorTool[] = [
  "select",
  "road",
  "zone",
  "wall",
  "building",
  "source",
  "sink",
  "target",
  "shop",
  "transitStop",
  "counter",
  "gate",
  "obstacle",
  "hazard",
  "countLine",
  "connector",
];

export type EditorWall = {
  id: string;
  /** The floor this is on; absent means the scene's only floor. */
  floorId?: string;
  points: ScenePoint[];
};

export type EditorEntrance = {
  id: string;
  /** The floor this is on; absent means the scene's only floor. */
  floorId?: string;
  kind: CrowdSimScene["entrances"][number]["kind"];
  position: ScenePoint;
  width: number;
  arrivalRatePerMinute: number;
  arrivalProfile?: { intervalMinutes: number; ratesPerMinute: number[] };
  groupShare?: number;
  exitIds?: string[];
  /** A population from the library, by id (ADR-0011). Absent: the default. */
  populationId?: string;
};

export type EditorTarget = {
  id: string;
  /** The floor this is on; absent means the scene's only floor. */
  floorId?: string;
  position: ScenePoint;
  radius: number;
};

export type EditorShopBrand = NonNullable<CrowdSimScene["shops"][number]["brand"]>;
export type EditorZoneCategory = CrowdSimScene["zones"][number]["category"];

export type EditorZone = {
  id: string;
  /** The floor this is on; absent means the scene's only floor. */
  floorId?: string;
  attraction: number;
  category: EditorZoneCategory;
  dwellMeanSeconds: number;
  name?: string;
  points: ScenePoint[];
  walkable: boolean;
};

export type EditorShop = {
  id: string;
  /** The floor this is on; absent means the scene's only floor. */
  floorId?: string;
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
  /** The floor this is on; absent means the scene's only floor. */
  floorId?: string;
  name?: string;
  servers?: number;
  kind: "counter" | "gate";
  position: ScenePoint;
  width: number;
  serviceMeanSeconds: number;
  capacityPerMinute: number;
  /** The next stage in a checkpoint chain (ADR-0017). No editor control
   * exists for this yet — round-tripped so an apply doesn't silently drop a
   * value a scene author set some other way (e.g. hand-edited JSON). */
  nextServicePointId?: string;
  outageWindows: { startsAtSeconds: number; endsAtSeconds: number }[];
};

export type EditorCountLine = {
  id: string;
  /** The floor this is on; absent means the scene's only floor. */
  floorId?: string;
  /** Absent is fine: a line is useful unnamed, and the label falls back. */
  name?: string;
  points: [ScenePoint, ScenePoint];
};

type EditorRoadDirection = CrowdSimScene["roads"][number]["direction"];
type EditorBuildingKind = CrowdSimScene["buildings"][number]["kind"];
type EditorTransitStopKind = CrowdSimScene["transitStops"][number]["kind"];
type EditorObstacleKind = CrowdSimScene["obstacles"][number]["kind"];
type EditorHazardKind = CrowdSimScene["hazards"][number]["kind"];

export type EditorRoad = {
  id: string;
  /** The floor this is on; absent means the scene's only floor. */
  floorId?: string;
  name?: string;
  points: ScenePoint[];
  widthMeters: number;
  direction: EditorRoadDirection;
  speedLimitMetersPerSecond: number;
  capacityPerMinute: number;
  walkable: boolean;
  transitOnly: boolean;
  /** Vehicle simulation fields (ADR-0016). No editor control exists for
   * these yet — round-tripped so an apply doesn't silently reset a road a
   * scene author configured some other way (e.g. hand-edited JSON) back to
   * the schema defaults. This is the same lesson `EditorServicePoint`'s
   * chain/outage fields already apply (see that type's own comment) —
   * missed for roads the first time these fields were added, found on
   * review rather than by a later bug report. */
  vehicleAccessible: boolean;
  vehicleArrivalRatePerMinute: number;
  vehicleSpeedLimitMetersPerSecond: number;
};

export type EditorBuilding = {
  id: string;
  /** The floor this is on; absent means the scene's only floor. */
  floorId?: string;
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
  /** The floor this is on; absent means the scene's only floor. */
  floorId?: string;
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
  /** The floor this is on; absent means the scene's only floor. */
  floorId?: string;
  name?: string;
  kind: EditorObstacleKind;
  geometryType: "polygon" | "polyline";
  points: ScenePoint[];
  blocksMovement: boolean;
  routeCostMultiplier: number;
};

export type EditorHazard = {
  id: string;
  /** The floor this is on; absent means the scene's only floor. */
  floorId?: string;
  name?: string;
  kind: EditorHazardKind;
  position: ScenePoint;
  radiusMeters: number;
  /** Seconds for the affected radius to grow from 0 to radiusMeters
   * (ADR-0012, fire/smoke only, ignored otherwise). */
  growthSeconds: number;
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

/**
 * A way between two floors: stairs, an escalator or a lift (ADR-0010). It is
 * not on a floor — it joins two — so it carries both ends rather than a
 * `floorId`.
 */
export type EditorConnector = {
  id: string;
  name?: string;
  kind: "escalator" | "stair" | "elevator";
  fromFloorId: string;
  fromPoint: ScenePoint;
  toFloorId: string;
  toPoint: ScenePoint;
  width: number;
  bidirectional: boolean;
  /** A lift's own fields — set by `ConnectorParamGrid` when its kind is
   * "elevator", and round-tripped either way, so a scene authored with them
   * (JSON, or the panel) survives an unrelated edit rather than silently
   * reverting to defaults. */
  capacity?: number;
  carCount?: number;
  doorSeconds?: number;
};

/**
 * A floor of the scene (ADR-0010). `level` orders them, lowest first;
 * `elevationMeters` is how high it sits, which sets how long a connector to it
 * takes to climb (`connectorTravelSeconds`).
 */
export type EditorFloor = {
  id: string;
  name?: string;
  level: number;
  elevationMeters: number;
};

export type EditorDocument = {
  /**
   * The floor being drawn on. Newly drawn primitives are stamped with it, and
   * the canvas shows only what is on it. Undefined when the scene declares no
   * floors, which is every scene that predates them: then nothing is stamped
   * and the editor behaves exactly as it did.
   */
  activeFloorId?: string;
  buildings: EditorBuilding[];
  connectors: EditorConnector[];
  countLines: EditorCountLine[];
  floors: EditorFloor[];
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
