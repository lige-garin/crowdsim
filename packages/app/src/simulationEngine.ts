import type { WallSegment } from "@crowdsim/core-gpu";
import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";
import { clampPointToWorld, type SceneWorldBounds } from "./sceneGeometry";
import { sampleBodyRadius, sampleSpeedFactor } from "./behaviorDistributions";
import { createRouter, type Router } from "./crowdNavigation";
import {
  buildFlightLane,
  createFloorGraph,
  elevatorCarFloorId,
  flightFloorId,
  type ConnectorRuntime,
} from "./floorRouting";
import {
  createConnectorTraffic,
  planFloorLegs,
  stepConnectorTravel,
} from "./floorTransfers";
import { createElevatorRuntime, stepElevatorTravel } from "./elevatorTransfers";
import { riderDisplayPosition } from "./floorTransferDisplay";
import { stepCrowd, type SocialForceParameters } from "./crowdMovement";
import {
  exposureSpeedFactor,
  fedDoseThisTick,
  fedIncapacitationDose,
  hazardAvoidancePush,
  mostExposingHazard,
  smokeRadiusAt,
  type SimulationHazard,
} from "./smokeHazards";
import { weidmannMaxSpecificFlow } from "./pedestrianFundamentalDiagram";
import { stepVehicles, type RoadRuntime, type VehicleAgent } from "./vehicleSimulation";
import { createWallIndex, type WallIndex } from "./wallIndex";
import { crowdBudget } from "./crowdBudget";
import {
  applySimulationAgentDecisions,
  nearestAllowedSink,
  calculateSimulationDecisionTick,
  shouldRunDecisionTick,
  type SimulationAgentDecisionState,
  type SimulationAgentWalkProgress,
  type SimulationDecisionBackend,
  type SimulationServicePoint,
  type SimulationShop,
} from "./simulationDecisionBackend";
import { samplePerson, type PopulationMix } from "./populationSampling";
import { mulberry32, samplePoisson } from "./simulationEngineRandom";
import {
  defaultSpeedMetersPerSecond,
  deriveSceneGeometry,
  type SceneFloorGeometry,
  type SceneGeometry,
} from "./simulationSceneConfig";
import { reconcileAgentsWithScene } from "./simulationSceneReconcile";
import {
  followLeaders,
  groupSpeedRatio,
  meanArrivalSize,
  sampleArrivalSize,
  splitGroups,
  walkingGroupParameters,
} from "./walkingGroups";
export type SimulationStatus = "paused" | "running";
export type SimulationAgent = {
  decisionTick?: number;
  id: number;
  lifecycleState?: SimulationAgentDecisionState;
  selectedStoreId?: string;
  /** When browsing a shop, the sim time at which the dwell ends and the agent leaves. */
  browseUntilSeconds?: number;
  /** While queuing, the sim time at which the shopper runs out of patience. */
  queueUntilSeconds?: number;
  /** While queuing, when the shopper joined the line: sets their place in it. */
  queueJoinedSeconds?: number;
  /** Closest approach to the current walk target, used to detect a blocked route. */
  walkProgress?: SimulationAgentWalkProgress;
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
  targetSinkId?: string;
  /** Exits this agent may leave by, copied from its entrance (ADR-0008). */
  exitIds?: readonly string[];
  /** The checkout counter a buyer is walking to, waiting at or served by. */
  servicePointId?: string;
  /**
   * How many service points this journey has already been chained through
   * (ADR-0021), via a service point's own `nextServicePointId`. A safety
   * counter, not a modelling choice: it exists only to cap a scene author's
   * chain-authoring mistake (e.g. a cycle) at a bounded number of hops rather
   * than an infinite one — see `maxCheckpointHops` in
   * `mallCrowdDecisionBackend.ts`. Absent means zero, the same as every
   * agent whose service point (if any) chains nowhere.
   */
  checkpointHopCount?: number;
  /** The anticipatory push last planned for this person, m/s² (crowdMovement). */
  avoidance?: readonly [number, number];
  /** People who arrived together share this: the id of the first of them. */
  groupId?: number;
  /** Body radius in metres, drawn at spawn (`behaviorDistributions`). */
  radius?: number;
  /** Free walking speed relative to the scene's mean, drawn at spawn. */
  speedFactor?: number;
  /**
   * The walking profile this person was drawn from (ADR-0011), when the scene
   * declared a population. Absent means the engine's own speed distribution.
   */
  profileId?: string;
  /** Their speed on a connector, m/s, when a profile gave them one. */
  stairUpMetersPerSecond?: number;
  stairDownMetersPerSecond?: number;
  /**
   * Set while riding a connector (floorTransfers, crowdMovement): this
   * person's own free speed on the flight, m/s, in place of the scene's
   * walking speed times `speedFactor`. A stair or escalator has its own
   * literature speed, drawn once at boarding (`personFlightSpeedMetersPerSecond`)
   * and cleared on arrival so it never leaks into a later walk on a real floor.
   */
  flightSpeedMetersPerSecond?: number;
  /**
   * This tick's free-speed multiplier from fire/smoke exposure
   * (`smokeHazards.exposureSpeedFactor`), recomputed every tick rather than
   * drawn once — unlike `speedFactor`, exposure changes as a hazard grows
   * and as this person moves, so it is not a personal trait to keep.
   * Absent, not 1, when nothing exposes them: distinguishes "computed and
   * clear" from "hazards were never evaluated this tick" for anything that
   * might read it before the first hazard pass runs.
   */
  smokeSpeedFactor?: number;
  /**
   * This tick's steering push away from whichever hazard exposes this
   * person worst (`smokeHazards.hazardAvoidancePush`), m/s² — added into
   * `crowdMovement`'s own force sum alongside the wall and anticipation
   * pushes, the same way `avoidance` (anticipation) already is.
   */
  hazardAvoidance?: readonly [number, number];
  /**
   * Fractional dose toward incapacitation (`smokeHazards.fedDoseThisTick`),
   * accumulated every tick this person is exposed to fire/smoke. Self-
   * authored in the shape of fractional-effective-dose reasoning, not a
   * reproduction of a specific published toxicity model — see
   * `smokeHazards.ts`'s own doc comment for what that means and does not
   * mean. Absent until first exposed, not 0, so "never exposed" and
   * "exposed but recovered to zero" stay distinguishable if that ever
   * matters.
   */
  fedDose?: number;
  /**
   * Set once `fedDose` reaches `smokeHazards.fedIncapacitationDose` and
   * never cleared: this person stops walking (pinned where they went down)
   * and is skipped by every decision backend and by `isExitBound`, so they
   * can never be decided for again or counted as having left. A disclosed
   * simplification: incapacitation stops the walk, not the body — someone
   * who goes down is still a standing-sized obstacle a crowd can jostle,
   * not a collapsed one a crowd would have to step around or over.
   */
  incapacitated?: boolean;
  /**
   * The floor this person is on (ADR-0010); absent in a one-floor scene.
   * While riding a connector this is that connector's own synthetic floor id
   * (`flightFloorId`, ADR-0010 stage 5) — its own walkable lane, not either
   * real floor either mouth sits on (floorRouting, floorTransfers).
   */
  floorId?: string;
  /**
   * Where this person is really going when that is on another floor, with the
   * connector they are crossing to reach it. While this is set, `targetX`/
   * `targetY` are the near end of that connector — the leg being walked now —
   * or, once they have boarded it, the far end of the flight itself, in the
   * flight's own coordinates (`isRiding`).
   */
  transfer?: {
    connectorId: string;
    /** The connector's own shaft/flight id (`ConnectorRuntime.shaftId`) — a
     * lift's two directions share one, so `isRiding` finds the one shared
     * car floor regardless of which direction routed this person onto it. */
    shaftId: string;
    finalX: number;
    finalY: number;
    floorId: string;
  };
  /**
   * Where to draw/count this person while `isRiding` (floorTransferDisplay),
   * set only in a snapshot's own copy of `agents`, never on the engine's
   * internal state: `floorId`/`x`/`y` above stay the flight's own synthetic
   * id and lane-local coordinates, which `isRiding` and anything timing a
   * flight (the RiMEA stair-speed tests) still need unchanged. A renderer or
   * report that wants "which real floor, and where on it" reads this instead
   * — undefined for anyone not riding, meaning "use floorId/x/y as-is".
   */
  display?: { floorId: string; x: number; y: number };
};
export type SimulationSource = {
  id: string;
  /** The floor people arrive on; absent in a scene with one floor. */
  floorId?: string;
  position: ScenePoint;
  width: number;
  arrivalRatePerSecond: number;
  /**
   * People a second in consecutive slots from the start of the run; replaces
   * `arrivalRatePerSecond` while it lasts, and nobody arrives after it ends.
   */
  arrivalProfile?: { intervalSeconds: number; ratesPerSecond: readonly number[] };
  /** Share of arriving people who come in groups (walkingGroups). Default 0. */
  groupShare?: number;
  /** Exits arrivals here may leave by; absent or empty means any. */
  exitIds?: readonly string[];
  /** Who comes through this door (ADR-0011); absent means the engine default. */
  population?: PopulationMix;
};
export type SimulationSink = {
  id: string;
  /** The floor the exit is on; absent in a scene with one floor. */
  floorId?: string;
  position: ScenePoint;
  radius: number;
};
/** A transit stop's static facts (ADR-0024) — everything about it that does
 * not depend on whether a vehicle happens to be there this tick. Shaped like
 * `SimulationSink` plus the two fields boarding demand/rate need, since the
 * engine uses one as a sink (for the "just boarded, vanish here" exit) and
 * the other as a synthesized service point (for the queue itself). */
export type SimulationTransitStopGeometry = SimulationSink & {
  boardingCapacityPerMinute: number;
  pedestrianDemandShare: number;
};
export type SimulationEngineConfig = {
  decisionBackend?: SimulationDecisionBackend;
  /** Every floor's plane. A config without it is one floor: `walls` + `world`. */
  floors?: SceneFloorGeometry[];
  /** One-way ways between floors (ADR-0010). */
  connectors?: ConnectorRuntime[];
  /** Fire/smoke that slows and can incapacitate a crowd (ADR-0012). */
  hazards?: SimulationHazard[];
  /** `vehicleAccessible` roads, stepped once per floor alongside that floor's
   * pedestrians (ADR-0016 stage 1, wired in by ADR-0020). Absent or empty —
   * the overwhelming majority of scenes — means vehicle stepping is skipped. */
  roads?: RoadRuntime[];
  /**
   * Overrides for the social-force model's own constants (calibration,
   * sensitivity analysis) — passed straight through to `stepCrowd`'s own
   * `parameters`. Absent means the fitted defaults
   * (`crowdMovement.socialForceParameters`), which is every scene run
   * before this existed and everywhere a scene does not ask otherwise.
   */
  movementParameters?: Partial<SocialForceParameters>;
  fixedDtSeconds?: number;
  maxAgents?: number;
  seed?: number;
  speedMetersPerSecond?: number;
  shops?: readonly SimulationShop[];
  servicePoints?: readonly SimulationServicePoint[];
  /** Boardable transit stops (ADR-0024). Absent or empty — the overwhelming
   * majority of scenes — means no synthesized boarding service point is ever
   * added and `exitRadius` never needs the fallback lookup. */
  transitStops?: readonly SimulationTransitStopGeometry[];
  sources: SimulationSource[];
  sinks: SimulationSink[];
  walls?: WallSegment[];
  world?: SceneWorldBounds;
};
export type SimulationSnapshot = {
  status: SimulationStatus;
  elapsedSeconds: number;
  stepCount: number;
  timeScale: number;
  agentCount: number;
  spawnedCount: number;
  exitedCount: number;
  agents: SimulationAgent[];
  /**
   * `vehicleAccessible` road traffic (ADR-0016 stage 1, wired in by
   * ADR-0020). Absent has the same meaning as `[]`: no vehicle-accessible
   * road in the scene. Optional for the same reason `evacuationClearSeconds`
   * is — the many callers building a snapshot-shaped object for a run with
   * no vehicles need not invent one; the engine's own `makeSnapshot` always
   * sets it.
   */
  vehicles?: VehicleAgent[];
  /**
   * Seconds from the alarm to the last person to leave during it, so a report
   * can say how long the building took to clear. 0 until someone leaves. It is
   * a clear time, not a safe time: it says nothing about anyone still inside.
   *
   * Optional only so the many callers that build a snapshot for a run with no
   * evacuation in it need not invent one; the engine always sets it.
   */
  evacuationClearSeconds?: number;
  /** How many left by each exit during this evacuation. */
  evacuationExits?: Record<string, number>;
  /**
   * How many are incapacitated by fire/smoke right now (ADR-0012) — a
   * running count, not a total, since it is read off `agents` fresh each
   * snapshot rather than accumulated like `exitedCount`.
   *
   * Optional for the same reason `evacuationClearSeconds` is: the many
   * callers that build a snapshot-shaped object for a run with no hazards in
   * it need not invent one; the engine's own `makeSnapshot` always sets it.
   */
  incapacitatedCount?: number;
};
export type SimulationEngine = {
  pause: () => SimulationSnapshot;
  reset: () => SimulationSnapshot;
  setEvacuation: (active: boolean) => SimulationSnapshot;
  setTimeScale: (timeScale: number) => SimulationSnapshot;
  snapshot: () => SimulationSnapshot;
  start: () => SimulationSnapshot;
  step: (steps?: number) => SimulationSnapshot;
  tick: (realDeltaSeconds: number) => SimulationSnapshot;
  /** Swap scene-derived geometry in place; agents, clock and counters carry on. */
  replaceGeometry: (geometry: SceneGeometry) => SimulationSnapshot;
};
/** An engine built from a scene, which can take a hot scene update (ADR-0007). */
export type SceneSimulationEngine = SimulationEngine & {
  /** Throws when `hotUpdateBlocker` refuses; the caller must then re-init. */
  updateScene: (scene: CrowdSimScene) => SimulationSnapshot;
};
const defaultFixedDtSeconds = 1 / 60;
// Measured 2026-09-14 in Node on the rainy high street with the social-force
// model (`crowdMovement`): 2,000 agents = 4.2 ms/step (the kinematic model it
// replaced measured 8.64 ms at 2k on 2026-09-12). Cost grows with local density,
// since every neighbour within 2 m is a pair to evaluate; entrance capacity keeps
// spawns from piling hundreds onto one point. 2,000 stays the CPU path's
// ceiling — ten thousand needs the resident GPU core.
const defaultMaxAgents = crowdBudget.maxAgents;
const maxRealDeltaSeconds = 0.25;
/** Steps between anticipation replans: 20 Hz at the 60 Hz default step. */
const anticipationReplanSteps = 3;
/** Boarding "doors" a transit stop's synthesized service point offers while a
 * vehicle is dwelling there (ADR-0024) — one, so `boardingCapacityPerMinute`
 * (via `serviceSeconds`) is a real one-at-a-time rate rather than every
 * queued rider being admitted at once and merely delayed. A self-chosen
 * constant, not read from any schema field. */
const transitBoardingDoors = 1;
export const simulationRuntimeProfile = {
  decisionBackend: "rule-ts",
  decisionHz: 10,
  maxAgents: defaultMaxAgents,
  movementBackend: "cpu-compat",
  movementHz: 60,
} as const;
/** People a second arriving at a source at a time in the run. */
export function arrivalRateAt(source: SimulationSource, elapsedSeconds: number) {
  const profile = source.arrivalProfile;
  if (!profile) return source.arrivalRatePerSecond;
  const slot = Math.floor(elapsedSeconds / profile.intervalSeconds);
  return profile.ratesPerSecond[slot] ?? 0;
}
export function createSimulationEngineFromScene(
  scene: CrowdSimScene,
  overrides: Partial<SimulationEngineConfig> = {},
): SceneSimulationEngine {
  // One stream for the default behaviour backend for the life of the engine,
  // so rebuilding that backend on a hot update does not restart it.
  const random = mulberry32(scene.seed);
  const engine = createSimulationEngine({
    seed: scene.seed,
    ...overrides,
    ...deriveSceneGeometry(scene, overrides, random),
  });
  const runtimeBackend = overrides.decisionBackend;
  let currentScene = scene;
  return {
    ...engine,
    updateScene(nextScene: CrowdSimScene) {
      const problem = hotUpdateBlocker(currentScene, nextScene, runtimeBackend);
      if (problem) {
        throw new Error(`hot scene update refused: ${problem}`);
      }
      currentScene = nextScene;
      return engine.replaceGeometry(deriveSceneGeometry(nextScene, overrides, random));
    },
  };
}

/**
 * Why a scene cannot be swapped into a running engine, or null if it can
 * (ADR-0007 rule 3). A caller that gets a reason must re-init instead.
 */
export function hotUpdateBlocker(
  current: CrowdSimScene,
  next: CrowdSimScene,
  injectedBackend?: SimulationDecisionBackend,
): string | null {
  // A different scene (loaded, imported, a template) is a different run, even
  // when it happens to share the seed and world size of the one on screen.
  if (current.id !== next.id) return "different scene";
  if (current.seed !== next.seed) return "seed changed";
  if (
    current.world.width !== next.world.width ||
    current.world.height !== next.world.height
  ) {
    return "world size changed";
  }
  // With no exit nobody can finish; the run is not a continuation of this one.
  if (!next.entrances.some((entrance) => entrance.kind !== "source")) {
    return "no exit left";
  }
  // An injected backend (the WASM model) bakes the shop list in at creation.
  if (injectedBackend) return "decision backend holds scene state";
  return null;
}
export function createSimulationEngine(
  config: SimulationEngineConfig,
): SimulationEngine {
  const fixedDtSeconds = config.fixedDtSeconds ?? defaultFixedDtSeconds;
  let decisionBackend = config.decisionBackend;
  const maxAgents = config.maxAgents ?? defaultMaxAgents;
  const movementParameters = config.movementParameters;
  // Scene-derived: replaced as a set by replaceGeometry (ADR-0007).
  let speedMetersPerSecond = config.speedMetersPerSecond ?? defaultSpeedMetersPerSecond;
  let sources = config.sources;
  let sinks = config.sinks;
  let shops = config.shops ?? [];
  let servicePoints = config.servicePoints ?? [];
  let transitStops = config.transitStops ?? [];
  const seed = config.seed ?? 1;
  /**
   * One routable plane per floor. A scene with no floors has exactly one, with
   * an undefined id, so stepping a crowd is the same code either way.
   */
  type FloorRuntime = {
    id?: string;
    router: Router;
    walls: WallIndex;
    world?: SceneWorldBounds;
  };
  function buildFloors(geometry: {
    floors?: SceneFloorGeometry[];
    walls?: WallSegment[];
    world?: SceneWorldBounds;
  }): FloorRuntime[] {
    const planes = geometry.floors?.length
      ? geometry.floors
      : [{ id: undefined, walls: geometry.walls ?? [], world: geometry.world }];

    return planes.map((plane) => ({
      id: plane.id,
      router: createRouter(plane.world, plane.walls),
      walls: createWallIndex(plane.walls),
      world: plane.world,
    }));
  }
  /**
   * One walkable lane per **shaft** (ADR-0010 stages 5–6, `buildFlightLane`),
   * stepped by the same per-floor crowd loop as a real floor. Kept out of
   * `floors` itself: `floorRuntime`/`floorGraph` use `floors` to answer
   * "which real floor is X on", and a flight is not an answer to that — it is
   * somewhere between two of them, never a decision's destination.
   *
   * Keyed by `shaftId`, not `id`: a stair's own two directions never share
   * one (each `shaftId` equals its own `id`), but a lift's two directions do
   * — one physical car, so one floor for it, not two. A lift with more than
   * one car gets one floor **per car** (`elevatorCarFloorId`) — two cars in
   * the same shaft are two boxes, never sharing a floor and so never sharing
   * the space either.
   */
  function buildFlightFloors(
    connectorList: readonly ConnectorRuntime[],
  ): FloorRuntime[] {
    const bySharedShaft = new Map<string, ConnectorRuntime>();
    for (const connector of connectorList) {
      if (!bySharedShaft.has(connector.shaftId)) {
        bySharedShaft.set(connector.shaftId, connector);
      }
    }

    return [...bySharedShaft.values()].flatMap((connector) => {
      const lane = buildFlightLane(connector);
      const floor = (id: string): FloorRuntime => ({
        id,
        router: createRouter(lane.world, []),
        walls: createWallIndex(lane.walls),
        world: lane.world,
      });

      if (connector.kind !== "elevator") {
        return [floor(flightFloorId(connector.shaftId))];
      }

      const carCount = connector.carCount ?? 1;
      return Array.from({ length: carCount }, (_, carIndex) =>
        floor(elevatorCarFloorId(connector.shaftId, carIndex)),
      );
    });
  }
  let floors = buildFloors(config);
  let connectors = config.connectors ?? [];
  let hazards = config.hazards ?? [];
  let roads = config.roads ?? [];
  let vehicles: VehicleAgent[] = [];
  let flightFloors = buildFlightFloors(connectors);
  let floorGraph = createFloorGraph({
    connectors,
    meanSpeedMetersPerSecond: speedMetersPerSecond,
    routerFor: (floorId) => floorRuntime(floorId)?.router,
  });
  let connectorTraffic = createConnectorTraffic(connectors);
  let elevatorCars = createElevatorRuntime(connectors);
  function floorRuntime(floorId: string | undefined) {
    return floors.find((floor) => floor.id === floorId) ?? floors[0];
  }
  /** The floor anything with no floor of its own belongs to. */
  const baseFloor = () => floors[0]?.id;
  let rng = mulberry32(seed);
  let status: SimulationStatus = "paused";
  let elapsedSeconds = 0;
  let accumulatorSeconds = 0;
  let stepCount = 0;
  let timeScale = 1;
  let nextAgentId = 1;
  let spawnedCount = 0;
  let exitedCount = 0;
  let agents: SimulationAgent[] = [];
  let evacuationActive = false;
  /** When the alarm went off, so reactions are not timed from the run's start. */
  let evacuationStartedSeconds = 0;
  /** From the alarm to the last person out of it. */
  let evacuationClearSeconds = 0;
  /** Departures per exit since the alarm, for "which doors did the work". */
  const evacuationExits = new Map<string, number>();
  function makeSnapshot(): SimulationSnapshot {
    const connectorsById = new Map(
      connectors.map((connector) => [connector.id, connector]),
    );
    return {
      status,
      elapsedSeconds,
      stepCount,
      timeScale,
      agentCount: agents.length,
      spawnedCount,
      exitedCount,
      // A rider's floorId is a flight's own synthetic id, and its x/y the
      // flight lane's own coordinates, not any real floor's (ADR-0010 stage
      // 5/6) — `display` carries where to draw/count them instead, leaving
      // floorId/x/y themselves unchanged so `isRiding` and anything timing a
      // flight (the RiMEA stair-speed tests) still work off them directly.
      agents: agents.map((agent) => ({
        ...agent,
        display: riderDisplayPosition(agent, connectorsById, elevatorCars),
      })),
      vehicles: vehicles.map((vehicle) => ({ ...vehicle })),
      evacuationClearSeconds,
      evacuationExits: Object.fromEntries(evacuationExits),
      incapacitatedCount: agents.reduce(
        (count, agent) => count + (agent.incapacitated ? 1 : 0),
        0,
      ),
    };
  }
  function spawnArrival(source: SimulationSource, size: number) {
    if (agents.length + size > maxAgents || sinks.length === 0) {
      return;
    }
    const jitter = (rng() - 0.5) * source.width;
    const firstId = nextAgentId;
    const ids = Array.from({ length: size }, (_, index) => firstId + index);
    const speedFactor =
      size > 1
        ? Math.min(...ids.map((id) => spawnSpeedFactor(source, id))) *
          groupSpeedRatio(size)
        : undefined;
    ids.forEach((_, index) =>
      spawnAgent(
        source,
        jitter + (index - (size - 1) / 2) * walkingGroupParameters.spacingMeters,
        size > 1 ? { groupId: firstId, speedFactor } : {},
      ),
    );
  }
  function spawnAgent(
    source: SimulationSource,
    jitter: number,
    group: { groupId?: number; speedFactor?: number },
  ) {
    const floorId = source.floorId ?? baseFloor();
    const spawnPoint = clampPointToWorld(
      {
        x: source.position.x,
        y: source.position.y + jitter,
      },
      floorRuntime(floorId).world,
    );
    const x = spawnPoint.x;
    const y = spawnPoint.y;
    // An arrival heads for an exit on their own floor when there is one: a
    // person who has just walked in is not looking for the stairs.
    const ownFloor = sinks.filter(
      (sink) => (sink.floorId ?? null) === (floorId ?? null),
    );
    const sink = nearestAllowedSink(
      { x, y },
      ownFloor.length > 0 ? ownFloor : sinks,
      source.exitIds,
    );
    const id = nextAgentId++;
    agents.push({
      ...(source.exitIds && source.exitIds.length > 0
        ? { exitIds: source.exitIds }
        : {}),
      id,
      ...(floorId === undefined ? {} : { floorId }),
      ...(group.groupId === undefined ? {} : { groupId: group.groupId }),
      radius: sampleBodyRadius(seed, id),
      speedFactor: group.speedFactor ?? spawnSpeedFactor(source, id),
      ...personFields(source, id),
      x,
      y,
      vx: 0,
      vy: 0,
      targetX: sink.position.x,
      targetY: sink.position.y,
      targetSinkId: sink.id,
    });
    spawnedCount++;
  }
  /**
   * The person drawn for this arrival, or undefined when the door declares no
   * population (or names a profile this build does not know).
   */
  function drawPerson(source: SimulationSource, agentId: number) {
    return source.population
      ? samplePerson(seed, agentId, source.population)
      : undefined;
  }
  /**
   * Speed as the engine already carries it: a factor on the scene's mean. A
   * drawn person's published speed is expressed the same way, so nothing
   * downstream — the social force, the groups, the fundamental diagram — has
   * to learn that populations exist.
   */
  function spawnSpeedFactor(source: SimulationSource, agentId: number) {
    const person = drawPerson(source, agentId);

    return person
      ? person.freeSpeedMetersPerSecond / speedMetersPerSecond
      : sampleSpeedFactor(seed, agentId);
  }
  function personFields(source: SimulationSource, agentId: number) {
    const person = drawPerson(source, agentId);

    return person
      ? {
          profileId: person.profileId,
          stairUpMetersPerSecond: person.stairUpMetersPerSecond,
          stairDownMetersPerSecond: person.stairDownMetersPerSecond,
        }
      : {};
  }
  function runFixedStep() {
    spawnArrivals();
    runDecisionTickIfNeeded();
    advanceAgentsCpu();
    elapsedSeconds += fixedDtSeconds;
    stepCount++;
  }
  function runDecisionTickIfNeeded() {
    if (!decisionBackend || agents.length === 0) {
      return;
    }
    const nextStepCount = stepCount + 1;
    if (
      !shouldRunDecisionTick({
        decisionHz: decisionBackend.decisionHz,
        movementHz: simulationRuntimeProfile.movementHz,
        nextStepCount,
      })
    ) {
      return;
    }
    const decisionTick = calculateSimulationDecisionTick({
      decisionHz: decisionBackend.decisionHz,
      movementHz: simulationRuntimeProfile.movementHz,
      stepCount: nextStepCount,
    });
    // Leaders decide for their groups; companions are not shoppers of their
    // own, so the behaviour model never puts them in a line or at a till.
    const groups = splitGroups(agents);
    const deciding = agents.filter((agent) => !groups.isCompanion(agent));
    agents = applySimulationAgentDecisions(
      agents,
      decisionBackend.decideAgents({
        agents: deciding,
        decisionTick,
        elapsedSeconds,
        sinks,
        shops,
        servicePoints: withTransitBoardingServicePoints(),
        evacuationActive,
        evacuationStartedSeconds,
        evacuatingFloorIds: currentEvacuatingFloorIds(),
        routeDistance: floorGraph.distance,
      }),
      decisionTick,
    );
    agents = followLeaders(agents, splitGroups(agents).leaders);
    // A decision can send someone to another floor; this turns that into the
    // leg they walk now (floorTransfers).
    agents = planFloorLegs(agents, floorGraph, sinks);
  }
  /**
   * `servicePoints`, plus one synthesized entry per transit stop (ADR-0024).
   * Rebuilt every decision tick, not cached — a stop's door is open only
   * while a real vehicle is dwelling there, which changes tick to tick, and
   * `transitStops` itself is small (a handful per scene, not per agent).
   * Reads `vehicles` as of the end of the previous `stepVehiclesTick()` call
   * (that call happens later in the same `runFixedStep`, inside
   * `advanceAgentsCpu`) — the same one-tick lag every other vehicle/pedestrian
   * interaction in this engine already carries.
   */
  function withTransitBoardingServicePoints(): readonly SimulationServicePoint[] {
    if (transitStops.length === 0) {
      return servicePoints;
    }
    const doorOpenStopIds = new Set(
      vehicles
        .filter((vehicle) => vehicle.dwellRemainingSeconds > 0)
        .map((vehicle) => vehicle.dwelledStopIds.at(-1))
        .filter((stopId): stopId is string => stopId !== undefined),
    );
    const boardingPoints: SimulationServicePoint[] = transitStops.map((stop) => ({
      floorId: stop.floorId,
      id: stop.id,
      kind: "transit",
      pedestrianDemandShare: stop.pedestrianDemandShare,
      position: stop.position,
      radius: stop.radius,
      serviceSeconds: 60 / stop.boardingCapacityPerMinute,
      servers: doorOpenStopIds.has(stop.id) ? transitBoardingDoors : 0,
    }));
    return [...servicePoints, ...boardingPoints];
  }
  /**
   * Which floors are actually evacuating right now (ADR-0025): the floors
   * carrying at least one currently-active fire/smoke hazard
   * (`smokeRadiusAt` > 0 — the same liveness check `applyHazardExposure`
   * already uses to slow and expose agents, so the two readings of "active"
   * never disagree). `undefined` means every floor: a scene with no hazards
   * declared has no floor to phase around, so `evacuationActive` alone still
   * evacuates the whole building, unchanged from before this field existed.
   * Also `undefined` when a scene has hazards declared but none is
   * currently active (not yet started, or already burned out) — with no
   * live fire to phase around, evacuating everyone stays the safe default
   * rather than evacuating nobody.
   */
  function currentEvacuatingFloorIds(): Set<string | undefined> | undefined {
    const floorIds = new Set<string | undefined>();
    for (const hazard of hazards) {
      if (smokeRadiusAt(hazard, elapsedSeconds) > 0) {
        floorIds.add(hazard.floorId);
      }
    }
    return floorIds.size > 0 ? floorIds : undefined;
  }
  /**
   * Arrivals enter through their entrance no faster than it can pass people:
   * its width times Weidmann's peak specific flow. The rest wait outside and
   * come in as room allows. Without this, a high arrival rate stacked hundreds
   * of people on one point of a narrow gate.
   */
  const waitingOutside = new Map<string, { admit: number; waiting: number[] }>();
  function spawnArrivals() {
    for (const source of sources) {
      const gate = waitingOutside.get(source.id) ?? { admit: 1, waiting: [] };
      const share = source.groupShare ?? 0;
      const arrivals = samplePoisson(
        (arrivalRateAt(source, elapsedSeconds) / meanArrivalSize(share)) *
          fixedDtSeconds,
        rng,
      );
      for (let index = 0; index < arrivals; index++) {
        gate.waiting.push(sampleArrivalSize(rng, share));
      }
      const perSecond = source.width * weidmannMaxSpecificFlow;
      // One person can always step through; the allowance never banks more
      // than a second's flow, so a long quiet spell does not release a crowd.
      gate.admit = Math.min(
        Math.max(1, perSecond),
        gate.admit + perSecond * fixedDtSeconds,
      );
      // A group goes through together; the allowance pays it back afterwards.
      while (gate.waiting.length > 0 && gate.admit >= 1) {
        const size = gate.waiting.shift()!;
        spawnArrival(source, size);
        gate.admit -= size;
      }
      waitingOutside.set(source.id, gate);
    }
  }
  /**
   * Fire/smoke exposure and dose (ADR-0012), once per tick over everyone not
   * already incapacitated: this tick's speed multiplier
   * (`smokeSpeedFactor`), the dose added, and — once that dose crosses
   * `fedIncapacitationDose` — pinning them where they stand and marking them
   * incapacitated. Runs before the movement loop so `crowdMovement` reads
   * this tick's multiplier, not last tick's.
   */
  function applyHazardExposure() {
    if (hazards.length === 0) {
      return;
    }
    agents = agents.map((agent) => {
      if (agent.incapacitated) {
        return agent;
      }
      const worst = mostExposingHazard(hazards, agent.floorId, agent, elapsedSeconds);
      if (!worst) {
        return agent.smokeSpeedFactor === undefined &&
          agent.hazardAvoidance === undefined
          ? agent
          : { ...agent, hazardAvoidance: undefined, smokeSpeedFactor: undefined };
      }
      const dose =
        (agent.fedDose ?? 0) +
        fedDoseThisTick(worst.exposure, worst.hazard.riskScore, fixedDtSeconds);
      const incapacitated = dose >= fedIncapacitationDose;
      return {
        ...agent,
        fedDose: dose,
        hazardAvoidance: incapacitated
          ? undefined
          : hazardAvoidancePush(worst.hazard, agent, worst.exposure),
        smokeSpeedFactor: incapacitated
          ? undefined
          : exposureSpeedFactor(worst.exposure, worst.hazard.speedMultiplier),
        incapacitated,
        ...(incapacitated ? { targetX: agent.x, targetY: agent.y } : {}),
      };
    });
  }

  /**
   * `vehicleAccessible` road traffic, one `stepVehicles` call per floor a
   * road sits on (`RoadRuntime.floorId`) — the same "one plane, its own
   * crowd" split `advanceAgentsCpu` already does for pedestrians, and for
   * the same reason: a car on floor 2 and a pedestrian crossing at the same
   * (x, y) on floor 1 are not near each other. No-ops when `roads` is empty,
   * so a scene with no vehicle-accessible road pays nothing for this.
   */
  function stepVehiclesTick() {
    if (roads.length === 0) {
      return;
    }
    const stepped: VehicleAgent[] = [];
    for (const floor of floors) {
      const roadsOnFloor = roads.filter(
        (road) => (road.floorId ?? baseFloor()) === floor.id,
      );
      if (roadsOnFloor.length === 0) {
        continue;
      }
      const roadIds = new Set(roadsOnFloor.map((road) => road.id));
      stepped.push(
        ...stepVehicles({
          dtSeconds: fixedDtSeconds,
          elapsedSeconds,
          pedestrians: agents.filter(
            (agent) => (agent.floorId ?? baseFloor()) === floor.id,
          ),
          random: rng,
          roads: roadsOnFloor,
          vehicles: vehicles.filter((vehicle) => roadIds.has(vehicle.roadId)),
        }),
      );
    }
    vehicles = stepped;
  }

  function advanceAgentsCpu() {
    applyHazardExposure();
    // Only handed over during an evacuation, so a normal step allocates
    // nothing for the per-exit tally.
    const exitedSinkIds: string[] = [];
    const stepped: SimulationAgent[] = [];
    // A flight lane is its own plane, stepped by the same loop as a real
    // floor: a rider pushes, and is pushed by, whoever else is on the same
    // flight, exactly as in any corridor (buildFlightFloors). No scene has a
    // connector without at least two real floors, so this is only ever
    // non-empty alongside more than one floor.
    const planes = flightFloors.length === 0 ? floors : [...floors, ...flightFloors];

    for (const plane of planes) {
      // One plane's crowd pushes only itself: two people at the same
      // coordinates on different floors, or on two different flights, are
      // not near each other.
      const onPlane =
        planes.length === 1
          ? agents
          : agents.filter((agent) => (agent.floorId ?? baseFloor()) === plane.id);

      if (onPlane.length === 0) {
        continue;
      }

      const result = stepCrowd({
        agents: onPlane,
        dtSeconds: fixedDtSeconds,
        replanAnticipation: stepCount % anticipationReplanSteps === 0,
        // Every agent is spawned with an exit, and reconciliation re-points it
        // whenever that exit is removed. Never read for a rider: isExitBound
        // is always false while `transfer` is set. A boarded transit rider's
        // `targetSinkId` names a transit stop (ADR-0024), never a `sinks`
        // entry — deliberately, so ordinary door-exit and evacuation choice
        // never see a bus stop as a candidate exit — so the lookup falls
        // back to `transitStops` for that one case.
        exitRadius: (agent) =>
          (sinks.find((sink) => sink.id === agent.targetSinkId) ??
            transitStops.find((stop) => stop.id === agent.targetSinkId))!.radius,
        exitedSinkIds: evacuationActive ? exitedSinkIds : undefined,
        isExitBound,
        meanSpeedMetersPerSecond: speedMetersPerSecond,
        parameters: movementParameters,
        router: plane.router,
        seed,
        walls: plane.walls,
        world: plane.world,
      });

      stepped.push(...result.agents);
      exitedCount += result.exitedCount;
    }

    connectorTraffic.replenish(fixedDtSeconds);
    agents = stepConnectorTravel({
      agents: stepped,
      connectors,
      graph: floorGraph,
      sinks,
      traffic: connectorTraffic,
    });
    agents = stepElevatorTravel({
      agents,
      cars: elevatorCars,
      connectors,
      graph: floorGraph,
      nowSeconds: elapsedSeconds,
      sinks,
    });
    stepVehiclesTick();
    if (evacuationActive && exitedSinkIds.length > 0) {
      for (const sinkId of exitedSinkIds) {
        evacuationExits.set(sinkId, (evacuationExits.get(sinkId) ?? 0) + 1);
      }
      // Moved on by every departure: the last one to leave is what clears the
      // building, so the figure ends up being the last departure of the run.
      evacuationClearSeconds = elapsedSeconds - evacuationStartedSeconds;
    }
  }
  /**
   * Only an agent that a decision sent to an exit may leave the world. The old
   * rule was the inverse ("exit unless walking/queuing/checking out"), which made
   * a freshly spawned agent — lifecycleState still undefined until the first
   * decision tick — exit-bound. At a `bidirectional` entrance that agent is born
   * inside the sink radius of the very gate it walked through (spawn jitter is
   * +/- width/2, sink radius is width/2), so it was deleted on its first step and
   * both exitedCount and throughput counted arrivals that never walked anywhere.
   * With no decision backend nobody ever assigns a state, and every agent is
   * spawned pointing at a sink, so reaching one is still the exit.
   */
  function isExitBound(agent: SimulationAgent) {
    // Walking to the stairs on the way to an exit downstairs is not arriving
    // at that exit: without this, reaching the stairs would count as leaving.
    if (agent.transfer) {
      return false;
    }
    // Pinned where they went down (ADR-0012) — never arriving anywhere
    // again, whatever sink they happen to have frozen near.
    if (agent.incapacitated) {
      return false;
    }
    if (agent.lifecycleState === "leave" || agent.lifecycleState === "evacuate") {
      return true;
    }
    return !decisionBackend && agent.lifecycleState === undefined;
  }
  return {
    pause() {
      status = "paused";
      return makeSnapshot();
    },
    replaceGeometry(geometry: SceneGeometry) {
      decisionBackend = geometry.decisionBackend;
      servicePoints = geometry.servicePoints;
      shops = geometry.shops;
      transitStops = geometry.transitStops ?? [];
      sinks = geometry.sinks;
      sources = geometry.sources;
      speedMetersPerSecond = geometry.speedMetersPerSecond;
      floors = buildFloors(geometry);
      connectors = geometry.connectors ?? [];
      hazards = geometry.hazards ?? [];
      roads = geometry.roads ?? [];
      // A road an edit deleted or made no longer vehicle-accessible cannot be
      // driven on any more; its vehicles are dropped rather than left to
      // reference a `roadId` `stepVehiclesTick` no longer groups by anything.
      // Same choice this engine already makes for a pedestrian standing on a
      // floor an edit removed (see `standing` below) — no `exitedCount`-style
      // tally exists for vehicles to omit, since `stepVehicles` itself already
      // despawns a car at its road's end with no counter (vehicleSimulation.ts).
      const roadIds = new Set(roads.map((road) => road.id));
      vehicles = vehicles.filter((vehicle) => roadIds.has(vehicle.roadId));
      flightFloors = buildFlightFloors(connectors);
      connectorTraffic = createConnectorTraffic(connectors);
      elevatorCars = createElevatorRuntime(connectors);
      floorGraph = createFloorGraph({
        connectors,
        meanSpeedMetersPerSecond: speedMetersPerSecond,
        routerFor: (floorId) => floorRuntime(floorId)?.router,
      });
      // Stranded agents (no exit left anywhere) leave the run but are not
      // exits: counting them would report an evacuation that never happened.
      // An edit can delete a floor people are standing on. They cannot be
      // stepped — there is no plane to step them on — and moving them to
      // another floor would put people somewhere the run never walked them.
      // So they leave the run here, deliberately and countably, rather than
      // disappearing from the per-floor step with the crowd count dropping and
      // nothing to say why (simulationSceneReconcile makes the same choice for
      // an agent whose exit is gone). A rider is standing on a flight, not a
      // real floor, so it counts here too — the connector it names can vanish
      // in an edit exactly as a floor can.
      const standing = new Set([...floors, ...flightFloors].map((floor) => floor.id));
      agents = planFloorLegs(
        reconcileAgentsWithScene(agents, geometry).filter((agent) =>
          standing.has(agent.floorId ?? baseFloor()),
        ),
        floorGraph,
        sinks,
      );
      return makeSnapshot();
    },
    reset() {
      rng = mulberry32(seed);
      status = "paused";
      elapsedSeconds = 0;
      accumulatorSeconds = 0;
      stepCount = 0;
      timeScale = 1;
      nextAgentId = 1;
      spawnedCount = 0;
      exitedCount = 0;
      waitingOutside.clear();
      agents = [];
      vehicles = [];
      evacuationActive = false;
      evacuationStartedSeconds = 0;
      return makeSnapshot();
    },
    setEvacuation(active: boolean) {
      // Raised again after being stood down, the clock restarts: people react
      // to the alarm they can hear now, not to one from ten minutes ago.
      if (active && !evacuationActive) {
        evacuationStartedSeconds = elapsedSeconds;
        evacuationClearSeconds = 0;
        evacuationExits.clear();
      }
      evacuationActive = active;
      return makeSnapshot();
    },
    setTimeScale(nextTimeScale: number) {
      timeScale = Math.max(0.25, Math.min(8, nextTimeScale));
      return makeSnapshot();
    },
    snapshot: makeSnapshot,
    start() {
      status = "running";
      return makeSnapshot();
    },
    step(steps = 1) {
      for (let index = 0; index < steps; index++) {
        runFixedStep();
      }
      return makeSnapshot();
    },
    tick(realDeltaSeconds: number) {
      if (status !== "running") {
        return makeSnapshot();
      }
      accumulatorSeconds +=
        Math.min(Math.max(realDeltaSeconds, 0), maxRealDeltaSeconds) * timeScale;
      while (accumulatorSeconds >= fixedDtSeconds) {
        runFixedStep();
        accumulatorSeconds -= fixedDtSeconds;
      }
      return makeSnapshot();
    },
  };
}
