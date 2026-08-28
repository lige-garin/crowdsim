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
  | "countLine";

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
];

export type EditorWall = {
  id: string;
  points: ScenePoint[];
};

export type EditorEntrance = {
  id: string;
  kind: CrowdSimScene["entrances"][number]["kind"];
  position: ScenePoint;
  width: number;
  arrivalRatePerMinute: number;
};

export type EditorTarget = {
  id: string;
  position: ScenePoint;
  radius: number;
};

export type EditorShopBrand = NonNullable<CrowdSimScene["shops"][number]["brand"]>;
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
