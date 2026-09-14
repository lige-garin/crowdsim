import type { WallSegment } from "@crowdsim/core-gpu";
import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { createBrandStoresFromScene } from "./brandAttraction";
import { calculateEnvironmentImpact } from "./environmentEffects";
import { createMallCrowdDecisionBackend } from "./mallCrowdDecisionBackend";
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
export type SceneGeometry = {
  decisionBackend?: SimulationDecisionBackend;
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
  scene: CrowdSimScene,
  overrides: SceneGeometryOverrides,
  /**
   * The default behaviour backend's random stream. Passed in so a hot update
   * can rebuild the backend around the stream it already consumed: a fresh
   * stream would replay the opening shop choices after every edit.
   */
  random: () => number,
): SceneGeometry {
  const environmentImpact = calculateEnvironmentImpact(scene, 0);
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
          position: entrance.position,
          radius: Math.max(1, entrance.width / 2),
        })),
    sources:
      overrides.sources ??
      scene.entrances
        .filter(
          (entrance) => entrance.kind !== "sink" && entrance.arrivalRatePerMinute > 0,
        )
        .map((entrance) => ({
          id: entrance.id,
          position: entrance.position,
          width: entrance.width,
          arrivalRatePerSecond: entrance.arrivalRatePerMinute / 60,
          exitIds: entrance.exitIds,
        })),
    speedMetersPerSecond: baseSpeed * environmentImpact.speedMultiplier,
    walls: overrides.walls ?? wallSegmentsFromScene(scene),
    world: overrides.world ?? scene.world,
  };
}
