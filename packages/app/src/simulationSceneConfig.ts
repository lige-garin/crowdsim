import { walkingGroupParameters } from "./walkingGroups";
import type { WallSegment } from "@crowdsim/core-gpu";
import {
  resolveFloorId,
  sceneFloors,
  sceneOnFloor,
  type CrowdSimScene,
} from "@crowdsim/scene-schema";
import {
  connectorLengthMeters,
  connectorTravelSeconds,
  type ConnectorRuntime,
} from "./floorRouting";
import { createBrandStoresFromScene } from "./brandAttraction";
import { calculateEnvironmentImpact } from "./environmentEffects";
import { createMallCrowdDecisionBackend } from "./mallCrowdDecisionBackend";
import { weidmannMaxSpecificFlow } from "./pedestrianFundamentalDiagram";
import { populationFor } from "./populationSampling";
import { wallSegmentsFromScene, type SceneWorldBounds } from "./sceneGeometry";
import type {
  SimulationDecisionBackend,
  SimulationServicePoint,
  SimulationShop,
} from "./simulationDecisionBackend";
import type { SimulationSink, SimulationSource } from "./simulationEngine";
import { weatherCrowdImpact } from "./weatherCrowdImpact";

// Weidmann free-flow speed. Was 8 m/s (~29 km/h, 6x a walking human): every UI
// path simulates at this default because neither the controller nor the worker
// passes an explicit speed, so editor-built scenes ran at sprint pace. Must
// match the scene-schema default (sceneSchema speedMetersPerSecond).
export const defaultSpeedMetersPerSecond = 1.34;

/** Browsers keep this far in from a shop's outline, clear of its walls. */
const browseInsetMeters = 0.6;

function unitVector(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  return length > 1e-6 ? { x: dx / length, y: dy / length } : undefined;
}

/**
 * Everything the engine takes from a scene. Nothing else in the engine reads
 * `CrowdSimScene`, which is what lets a running engine swap geometry in place
 * (ADR-0007): derive this again, hand it over, keep the agents.
 */
/** One floor's own plane: what a walker on it can be blocked by, and how big it is. */
export type SceneFloorGeometry = {
  /** Absent in a scene that declares no floors, where there is one plane. */
  id?: string;
  walls: WallSegment[];
  world?: SceneWorldBounds;
};

export type SceneGeometry = {
  decisionBackend?: SimulationDecisionBackend;
  /** Every floor's plane. Always at least one, so the engine has no special case. */
  floors: SceneFloorGeometry[];
  /** The ways between floors, each already one-way (ADR-0010). */
  connectors: ConnectorRuntime[];
  servicePoints: SimulationServicePoint[];
  shops: SimulationShop[];
  sinks: SimulationSink[];
  sources: SimulationSource[];
  speedMetersPerSecond: number;
  walls: WallSegment[];
  world?: SceneWorldBounds;
};

export type SceneGeometryOverrides = {
  decisionBackend?: SimulationDecisionBackend;
  speedMetersPerSecond?: number;
  walls?: WallSegment[];
  world?: SceneWorldBounds;
  sources?: SimulationSource[];
  sinks?: SimulationSink[];
};

export function deriveSceneGeometry(
  fullScene: CrowdSimScene,
  overrides: SceneGeometryOverrides,
  /**
   * The default behaviour backend's random stream. Passed in so a hot update
   * can rebuild the backend around the stream it already consumed: a fresh
   * stream would replay the opening shop choices after every edit.
   */
  random: () => number,
): SceneGeometry {
  const scene = fullScene;
  const environmentImpact = calculateEnvironmentImpact(scene, 0);
  // Absent means the base floor, so everything the engine compares — an
  // agent's floor, a shop's, an exit's — is the same kind of value.
  const floorOf = (entity: { floorId?: string }) => resolveFloorId(scene, entity);
  // Precedence: explicit override > scene-persisted field > engine default.
  const baseSpeed =
    overrides.speedMetersPerSecond ??
    scene.speedMetersPerSecond ??
    defaultSpeedMetersPerSecond;
  const weather = weatherCrowdImpact(environmentImpact);
  const shops: SimulationShop[] = scene.shops.map((shop) => {
    const door = shop.entrancePosition ?? shop.position;
    const queuePosition = shop.queueAnchor ?? door;
    return {
      id: shop.id,
      floorId: floorOf(shop),
      position: door,
      radius: Math.max(2, Math.max(shop.size.width, shop.size.height) / 2),
      attraction: shop.attraction,
      dwellSeconds: shop.dwellMeanSeconds * weather.dwellMultiplier,
      capacity: shop.capacity,
      queuePosition,
      // The line runs away from the shop: from the door out past the anchor,
      // or, with no anchor, from the shop's centre out through its door.
      queueDirection: unitVector(door, queuePosition) ??
        unitVector(shop.position, door) ?? { x: 0, y: 1 },
      browseArea: {
        x: shop.position.x,
        y: shop.position.y,
        halfWidth: Math.max(0, shop.size.width / 2 - browseInsetMeters),
        halfHeight: Math.max(0, shop.size.height / 2 - browseInsetMeters),
      },
      conversionRate: shop.conversionRate,
    };
  });

  return {
    decisionBackend:
      overrides.decisionBackend ??
      createMallCrowdDecisionBackend({
        brandStores: createBrandStoresFromScene(scene),
        random,
        seed: scene.seed,
        shops,
      }),
    servicePoints: scene.servicePoints.map((servicePoint) => ({
      id: servicePoint.id,
      floorId: floorOf(servicePoint),
      position: servicePoint.position,
      radius: Math.max(2, servicePoint.width / 2),
      serviceSeconds: servicePoint.serviceMeanSeconds,
      servers:
        servicePoint.servers ??
        Math.max(
          1,
          Math.round(
            (servicePoint.capacityPerMinute * servicePoint.serviceMeanSeconds) / 60,
          ),
        ),
    })),
    shops,
    sinks:
      overrides.sinks ??
      scene.entrances
        .filter((entrance) => entrance.kind !== "source")
        .map((entrance) => ({
          id: entrance.id,
          floorId: floorOf(entrance),
          position: entrance.position,
          radius: Math.max(1, entrance.width / 2),
        })),
    sources:
      overrides.sources ??
      scene.entrances
        .filter(
          (entrance) =>
            entrance.kind !== "sink" &&
            (entrance.arrivalRatePerMinute > 0 ||
              (entrance.arrivalProfile?.ratesPerMinute.some((rate) => rate > 0) ??
                false)),
        )
        .map((entrance) => ({
          id: entrance.id,
          floorId: floorOf(entrance),
          position: entrance.position,
          width: entrance.width,
          arrivalRatePerSecond: entrance.arrivalRatePerMinute / 60,
          arrivalProfile: entrance.arrivalProfile && {
            intervalSeconds: entrance.arrivalProfile.intervalMinutes * 60,
            ratesPerSecond: entrance.arrivalProfile.ratesPerMinute.map(
              (rate) => rate / 60,
            ),
          },
          groupShare:
            entrance.groupShare ?? walkingGroupParameters.shareOfPeopleInGroups,
          exitIds: entrance.exitIds,
          population: populationFor(scene, entrance),
        })),
    speedMetersPerSecond: baseSpeed * environmentImpact.speedMultiplier,
    floors: sceneFloorGeometries(scene, overrides),
    connectors: sceneConnectorRuntimes(scene),
    walls: overrides.walls ?? wallSegmentsFromScene(scene),
    world: overrides.world ?? scene.world,
  };
}

/**
 * One plane per floor, each holding only what stands on it.
 *
 * A scene with no floors gets a single unnamed plane, which is the whole scene
 * — so the engine steps every crowd the same way and nothing has to ask
 * whether this scene has floors.
 */
export function sceneFloorGeometries(
  scene: CrowdSimScene,
  overrides: SceneGeometryOverrides = {},
): SceneFloorGeometry[] {
  const floors = sceneFloors(scene);

  if (floors.length === 0) {
    return [
      {
        id: undefined,
        walls: overrides.walls ?? wallSegmentsFromScene(scene),
        world: overrides.world ?? scene.world,
      },
    ];
  }

  return floors.map((floor) => {
    const onFloor = sceneOnFloor(scene, floor.id) ?? scene;

    return {
      id: floor.id,
      walls: wallSegmentsFromScene(onFloor),
      world: overrides.world ?? onFloor.world,
    };
  });
}

/**
 * A scene's connectors as the engine uses them: **one-way each**. A staircase
 * marked `bidirectional` becomes two, because a walker only ever travels one
 * of the two directions and the router should not have to ask which.
 */
export function sceneConnectorRuntimes(scene: CrowdSimScene): ConnectorRuntime[] {
  const elevationOf = (floorId: string) =>
    scene.floors.find((floor) => floor.id === floorId)?.elevationMeters ?? 0;
  const runtimes: ConnectorRuntime[] = [];

  for (const connector of scene.connectors) {
    const rise =
      elevationOf(connector.to.floorId) - elevationOf(connector.from.floorId);
    // How many people a second a stair mouth can pass: the same width rule as
    // an entrance (ADR-0008), because it is the same constraint.
    const admitPerSecond = connector.width * weidmannMaxSpecificFlow;

    runtimes.push({
      id: connector.id,
      kind: connector.kind,
      fromFloorId: connector.from.floorId,
      fromPoint: connector.from.point,
      toFloorId: connector.to.floorId,
      toPoint: connector.to.point,
      travelSeconds: connectorTravelSeconds(
        connector.kind,
        rise,
        connector.speedMetersPerSecond,
      ),
      lengthMeters: connectorLengthMeters(rise),
      climbing: rise >= 0,
      admitPerSecond,
    });

    if (connector.bidirectional) {
      runtimes.push({
        id: `${connector.id}:down`,
        kind: connector.kind,
        fromFloorId: connector.to.floorId,
        fromPoint: connector.to.point,
        toFloorId: connector.from.floorId,
        toPoint: connector.from.point,
        travelSeconds: connectorTravelSeconds(
          connector.kind,
          -rise,
          connector.speedMetersPerSecond,
        ),
        lengthMeters: connectorLengthMeters(rise),
        climbing: -rise >= 0,
        admitPerSecond,
      });
    }
  }

  return runtimes;
}
