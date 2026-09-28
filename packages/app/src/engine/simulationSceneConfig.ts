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
import { weidmannMaxSpecificFlow } from "../analytics/pedestrianFundamentalDiagram";
import { populationFor } from "./populationSampling";
import { wallSegmentsFromScene, type SceneWorldBounds } from "./sceneGeometry";
import type {
  SimulationDecisionBackend,
  SimulationServicePoint,
  SimulationShop,
} from "./simulationDecisionBackend";
import type {
  SimulationSink,
  SimulationSource,
  SimulationTransitStopGeometry,
} from "./simulationEngine";
import type { SimulationHazard } from "./smokeHazards";
import { buildRoadRuntime, type RoadRuntime } from "./vehicleSimulation";
import { weatherCrowdImpact } from "./weatherCrowdImpact";

// Weidmann free-flow speed. Was 8 m/s (~29 km/h, 6x a walking human): every UI
// path simulates at this default because neither the controller nor the worker
// passes an explicit speed, so editor-built scenes ran at sprint pace. Must
// match the scene-schema default (sceneSchema speedMetersPerSecond).
export const defaultSpeedMetersPerSecond = 1.34;

/** Browsers keep this far in from a shop's outline, clear of its walls. */
const browseInsetMeters = 0.6;

/**
 * How close a rider must walk before counting as "at" a transit stop
 * (ADR-0024) — schema has no platform width to derive this from the way a
 * checkout counter's arrival radius comes from `servicePoint.width`, so it
 * is a self-chosen constant, the same class `evacuationExitCrowdingMeters`
 * already is.
 */
const transitStopArrivalRadiusMeters = 3;

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
  /** Fire/smoke that slows and can incapacitate a crowd (ADR-0012). */
  hazards: SimulationHazard[];
  /** `vehicleAccessible` roads, ready for the engine to spawn and drive
   * traffic on (ADR-0016 stage 1, wired in by ADR-0020). Empty on a scene
   * with none — the overwhelming majority — so vehicle stepping is a no-op. */
  roads: RoadRuntime[];
  servicePoints: SimulationServicePoint[];
  shops: SimulationShop[];
  sinks: SimulationSink[];
  sources: SimulationSource[];
  speedMetersPerSecond: number;
  /** `transitStops` a rider can actually queue and board at (ADR-0024).
   * Static per-stop facts only — whether a stop's door is open right now
   * depends on live vehicle state, which `simulationEngine.ts` computes
   * itself each tick, the same way it already infers the road network fresh
   * from `roads` rather than storing it here (ADR-0023). Empty on the
   * overwhelming majority of scenes, which declare no transit stops at all. */
  transitStops: SimulationTransitStopGeometry[];
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
      // ADR-0021: these two fields were, until now, write-only — a scene
      // author could set them and nothing downstream ever read them.
      nextServicePointId: servicePoint.nextServicePointId,
      outageWindows: servicePoint.outageWindows,
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
    hazards: sceneHazardRuntimes(scene),
    roads: sceneRoadRuntimes(scene),
    // Only a stop still declared active can attract riders — matches every
    // other "active" gate this project already respects (a servicePoint's
    // outageWindows, a hazard's own lifecycle). vehicleSimulation.ts itself
    // does not yet read `active` (out of this item's scope; a bus still
    // dwells at an inactive stop), so this only affects the pedestrian side.
    transitStops: scene.transitStops
      .filter((stop) => stop.active)
      .map((stop) => ({
        boardingCapacityPerMinute: stop.boardingCapacityPerMinute,
        floorId: floorOf(stop),
        id: stop.id,
        pedestrianDemandShare: stop.pedestrianDemandShare,
        position: stop.position,
        radius: transitStopArrivalRadiusMeters,
      })),
    walls: overrides.walls ?? wallSegmentsFromScene(scene),
    world: overrides.world ?? scene.world,
  };
}

/**
 * A scene's `vehicleAccessible` roads, ready to drive (ADR-0016 stage 1,
 * ADR-0023 stage 2, wired in by ADR-0020). Every other road — the
 * overwhelming majority, since `vehicleAccessible` defaults false — is left
 * out here exactly as `sceneHazardRuntimes` leaves out hazard kinds this
 * project has not modelled: still a shape on the map, never a simulated
 * one. `stepVehicles` infers the road *network* (which roads connect at a
 * junction) from these `RoadRuntime`s' own endpoints every tick — nothing
 * about connectivity is precomputed or stored here.
 */
export function sceneRoadRuntimes(scene: CrowdSimScene): RoadRuntime[] {
  return scene.roads
    .filter((road) => road.vehicleAccessible)
    .map((road) =>
      buildRoadRuntime(
        road,
        scene.crosswalks,
        scene.transitStops,
        resolveFloorId(scene, road),
        scene.trafficSignals,
      ),
    );
}

/**
 * A scene's `fire`/`smoke` hazards as the engine uses them (ADR-0012). Every
 * other hazard kind (`crowdSurge`, `flood`, `powerOutage`, `roadClosure`,
 * `securityIncident`, `transitDisruption`) is left out here — this pass only
 * wires up the two kinds `smokeHazards.ts` models; the rest remain what they
 * were before it, a shape drawn on the map with no simulated effect.
 */
export function sceneHazardRuntimes(scene: CrowdSimScene): SimulationHazard[] {
  return scene.hazards
    .filter((hazard) => hazard.kind === "fire" || hazard.kind === "smoke")
    .map((hazard) => ({
      id: hazard.id,
      floorId: hazard.floorId,
      position: hazard.position,
      radiusMeters: hazard.radiusMeters,
      growthSeconds: hazard.growthSeconds,
      startsAtSeconds: hazard.startsAtSeconds,
      endsAtSeconds: hazard.endsAtSeconds,
      severity: hazard.severity,
      speedMultiplier: hazard.speedMultiplier,
      visibilityMultiplier: hazard.visibilityMultiplier,
      riskScore: hazard.riskScore,
    }));
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
    const isElevator = connector.kind === "elevator";
    const rise =
      elevationOf(connector.to.floorId) - elevationOf(connector.from.floorId);
    // How many people a second a stair mouth can pass: the same width rule as
    // an entrance (ADR-0008), because it is the same constraint. A lift is
    // capacity-, not width-, limited, so this is never read for one.
    const admitPerSecond = connector.width * weidmannMaxSpecificFlow;
    const elevatorFields = isElevator
      ? {
          capacity: connector.capacity,
          carCount: connector.carCount,
          doorSeconds: connector.doorSeconds,
        }
      : {};

    runtimes.push({
      id: connector.id,
      shaftId: connector.id,
      kind: connector.kind,
      fromFloorId: connector.from.floorId,
      fromPoint: connector.from.point,
      toFloorId: connector.to.floorId,
      toPoint: connector.to.point,
      travelSeconds: connectorTravelSeconds(
        connector.kind,
        rise,
        connector.speedMetersPerSecond,
        connector.doorSeconds,
      ),
      lengthMeters: connectorLengthMeters(rise, connector.kind),
      climbing: rise >= 0,
      admitPerSecond,
      width: connector.width,
      ...elevatorFields,
    });

    // A stair or escalator marked `bidirectional` is really two one-way
    // flights sharing a footprint, so a second, independent runtime models
    // it. A lift's car serves both directions itself — `bidirectional` is
    // meaningless for one (ignored above) — so this always adds the return
    // direction, sharing `shaftId` with the first so `createElevatorRuntime`
    // pools them onto the same cars rather than two separate shafts.
    if (connector.bidirectional || isElevator) {
      runtimes.push({
        id: `${connector.id}:down`,
        shaftId: connector.id,
        kind: connector.kind,
        fromFloorId: connector.to.floorId,
        fromPoint: connector.to.point,
        toFloorId: connector.from.floorId,
        toPoint: connector.from.point,
        travelSeconds: connectorTravelSeconds(
          connector.kind,
          -rise,
          connector.speedMetersPerSecond,
          connector.doorSeconds,
        ),
        lengthMeters: connectorLengthMeters(rise, connector.kind),
        climbing: -rise >= 0,
        admitPerSecond,
        width: connector.width,
        ...elevatorFields,
      });
    }
  }

  return runtimes;
}
