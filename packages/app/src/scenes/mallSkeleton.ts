import {
  parseScene,
  type CrowdSimScene,
  type ScenePoint,
} from "@crowdsim/scene-schema";
import { generateStoreLotsForZone } from "../editor/storeLotGeneration";

/**
 * Storey height, metres. **Self-chosen, not calibrated** — it only gives the
 * floors a plausible relative elevation for connector travel times, and no
 * measurement behind it is cited anywhere.
 */
export const mallFloorHeightMeters = 4.5;

/** Clear walking width of an escalator flight, metres. Self-chosen. */
const escalatorWidthMeters = 1.2;

export type MallRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MallZoneSpec = {
  category: CrowdSimScene["zones"][number]["category"];
  rect: MallRect;
  name?: string;
  attraction?: number;
  dwellMeanSeconds?: number;
};

export type MallFloorSpec = {
  id: string;
  name?: string;
  level: number;
  elevationMeters?: number;
  zones: MallZoneSpec[];
};

export type MallSkeletonSpec = {
  id: string;
  name: string;
  world: { width: number; height: number };
  floors: MallFloorSpec[];
  /**
   * Where the vertical circulation core sits, in plan. Every floor uses the
   * same spot, which is what a real atrium is. Omit it for a single-level
   * scene, or to generate no cross-floor ways at all.
   */
  atrium?: ScenePoint;
  /** Doors people arrive at, on the lowest floor. Default: bottom edge. */
  entryDoors?: ScenePoint[];
  /** Doors people leave by, on the lowest floor. Default: top edge. */
  exitDoors?: ScenePoint[];
  /** Arrivals a minute at each arrival door. */
  arrivalRatePerMinute?: number;
};

/**
 * A shopping centre: floors, zones cut into store lots, the vertical ways
 * between floors, and doors on the ground floor.
 *
 * Nothing here predicts how many people come — `arrivalRatePerMinute` is
 * whatever the caller says, and an inferred one belongs in the claims ledger
 * as inferred, not here.
 */
export function createMallSkeleton(spec: MallSkeletonSpec): CrowdSimScene {
  const floors = [...spec.floors].sort((a, b) => a.level - b.level);
  const baseFloor = floors[0];

  if (!baseFloor) {
    throw new Error("A mall needs at least one floor");
  }

  const { width, height } = spec.world;
  // Arrivals and departures default to opposite edges, the way a mall is
  // walked through: someone who comes in and leaves by the same door never
  // crosses the floor, and a layout's effect on the crowd is mostly about
  // crossing it. Both defaults are overridable for a real site plan, where
  // the doors are where the site says they are.
  const arrivals = spec.entryDoors ?? [
    { x: width * 0.25, y: height - 1 },
    { x: width * 0.75, y: height - 1 },
  ];
  const departures = spec.exitDoors ?? [
    { x: width * 0.25, y: 1 },
    { x: width * 0.75, y: 1 },
  ];
  const arrivalRatePerMinute = spec.arrivalRatePerMinute ?? 40;

  let scene = parseScene({
    schemaVersion: "1.0.0",
    id: spec.id,
    name: spec.name,
    world: spec.world,
    floors: floors.map((floor) => ({
      id: floor.id,
      name: floor.name,
      level: floor.level,
      elevationMeters: floor.elevationMeters ?? floor.level * mallFloorHeightMeters,
      world: spec.world,
    })),
    walls: floors.map((floor) => ({
      id: `${floor.id}-perimeter`,
      floorId: floor.id,
      geometry: {
        type: "polygon" as const,
        points: [
          { x: 0, y: 0 },
          { x: width, y: 0 },
          { x: width, y: height },
          { x: 0, y: height },
        ],
      },
    })),
    zones: floors.flatMap((floor) =>
      floor.zones.map((zone, index) => ({
        id: zoneId(floor.id, index),
        name: zone.name,
        floorId: floor.id,
        category: zone.category,
        attraction: zone.attraction,
        dwellMeanSeconds: zone.dwellMeanSeconds,
        geometry: { type: "polygon" as const, points: rectPoints(zone.rect) },
      })),
    ),
    entrances: [
      ...arrivals.map((door, index) => ({
        id: `door-${index + 1}`,
        name: `Door ${index + 1}`,
        floorId: baseFloor.id,
        kind: "source" as const,
        position: door,
        width: 4,
        arrivalRatePerMinute,
      })),
      ...departures.map((door, index) => ({
        id: `exit-${index + 1}`,
        name: `Exit ${index + 1}`,
        floorId: baseFloor.id,
        kind: "sink" as const,
        position: door,
        width: 4,
      })),
    ],
    connectors: spec.atrium ? verticalConnectors(floors, spec.atrium) : [],
  });

  for (const zone of scene.zones) {
    scene = generateStoreLotsForZone(scene, zone.id).scene;
  }

  return scene;
}

function zoneId(floorId: string, index: number) {
  return `${floorId}-zone-${index + 1}`;
}

function rectPoints(rect: MallRect): ScenePoint[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
}

/**
 * An escalator runs one way (ADR-0010), so each pair of floors gets two: one
 * up and one down, side by side the way a real mall puts them. One lift per
 * pair, because one connector is one shaft between exactly two floors.
 */
function verticalConnectors(floors: MallFloorSpec[], atrium: ScenePoint) {
  return floors.slice(0, -1).flatMap((floor, index) => {
    const above = floors[index + 1];

    return [
      {
        id: `escalator-up-${floor.id}-${above.id}`,
        name: `Escalator up ${floor.id} to ${above.id}`,
        kind: "escalator" as const,
        from: { floorId: floor.id, point: { x: atrium.x - 1.5, y: atrium.y } },
        to: { floorId: above.id, point: { x: atrium.x - 1.5, y: atrium.y } },
        width: escalatorWidthMeters,
      },
      {
        id: `escalator-down-${above.id}-${floor.id}`,
        name: `Escalator down ${above.id} to ${floor.id}`,
        kind: "escalator" as const,
        from: { floorId: above.id, point: { x: atrium.x + 1.5, y: atrium.y } },
        to: { floorId: floor.id, point: { x: atrium.x + 1.5, y: atrium.y } },
        width: escalatorWidthMeters,
      },
      {
        id: `lift-${floor.id}-${above.id}`,
        name: `Lift ${floor.id} to ${above.id}`,
        kind: "elevator" as const,
        from: { floorId: floor.id, point: { x: atrium.x, y: atrium.y + 3 } },
        to: { floorId: above.id, point: { x: atrium.x, y: atrium.y + 3 } },
      },
    ];
  });
}
