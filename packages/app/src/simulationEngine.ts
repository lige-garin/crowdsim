import type { WallSegment } from "@crowdsim/core-gpu";
import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";
import { clampPointToWorld, type SceneWorldBounds } from "./sceneGeometry";
import { sampleBodyRadius, sampleSpeedFactor } from "./behaviorDistributions";
import { createRouter } from "./crowdNavigation";
import { stepCrowd } from "./crowdMovement";
import { weidmannMaxSpecificFlow } from "./pedestrianFundamentalDiagram";
import { createWallIndex } from "./wallIndex";
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
import { mulberry32, samplePoisson } from "./simulationEngineRandom";
import {
  defaultSpeedMetersPerSecond,
  deriveSceneGeometry,
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
  /** The anticipatory push last planned for this person, m/s² (crowdMovement). */
  avoidance?: readonly [number, number];
  /** People who arrived together share this: the id of the first of them. */
  groupId?: number;
  /** Body radius in metres, drawn at spawn (`behaviorDistributions`). */
  radius?: number;
  /** Free walking speed relative to the scene's mean, drawn at spawn. */
  speedFactor?: number;
};
export type SimulationSource = {
  id: string;
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
};
export type SimulationSink = {
  id: string;
  position: ScenePoint;
  radius: number;
};
export type SimulationEngineConfig = {
  decisionBackend?: SimulationDecisionBackend;
  fixedDtSeconds?: number;
  maxAgents?: number;
  seed?: number;
  speedMetersPerSecond?: number;
  shops?: readonly SimulationShop[];
  servicePoints?: readonly SimulationServicePoint[];
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
  // Scene-derived: replaced as a set by replaceGeometry (ADR-0007).
  let speedMetersPerSecond = config.speedMetersPerSecond ?? defaultSpeedMetersPerSecond;
  let sources = config.sources;
  let sinks = config.sinks;
  let shops = config.shops ?? [];
  let servicePoints = config.servicePoints ?? [];
  const seed = config.seed ?? 1;
  let world = config.world;
  let router = createRouter(world, config.walls ?? []);
  let wallIndex = createWallIndex(config.walls ?? []);
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
  function makeSnapshot(): SimulationSnapshot {
    return {
      status,
      elapsedSeconds,
      stepCount,
      timeScale,
      agentCount: agents.length,
      spawnedCount,
      exitedCount,
      agents: agents.map((agent) => ({ ...agent })),
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
        ? Math.min(...ids.map((id) => sampleSpeedFactor(seed, id))) *
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
    const spawnPoint = clampPointToWorld(
      {
        x: source.position.x,
        y: source.position.y + jitter,
      },
      world,
    );
    const x = spawnPoint.x;
    const y = spawnPoint.y;
    const sink = nearestAllowedSink({ x, y }, sinks, source.exitIds);
    const id = nextAgentId++;
    agents.push({
      ...(source.exitIds && source.exitIds.length > 0
        ? { exitIds: source.exitIds }
        : {}),
      id,
      ...(group.groupId === undefined ? {} : { groupId: group.groupId }),
      radius: sampleBodyRadius(seed, id),
      speedFactor: group.speedFactor ?? sampleSpeedFactor(seed, id),
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
        servicePoints,
        evacuationActive,
        evacuationStartedSeconds,
        routeDistance: router.distance,
      }),
      decisionTick,
    );
    agents = followLeaders(agents, splitGroups(agents).leaders);
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
  function advanceAgentsCpu() {
    const result = stepCrowd({
      agents,
      dtSeconds: fixedDtSeconds,
      replanAnticipation: stepCount % anticipationReplanSteps === 0,
      // Every agent is spawned with an exit, and reconciliation re-points it
      // whenever that exit is removed.
      exitRadius: (agent) =>
        sinks.find((sink) => sink.id === agent.targetSinkId)!.radius,
      isExitBound,
      meanSpeedMetersPerSecond: speedMetersPerSecond,
      router,
      seed,
      walls: wallIndex,
      world,
    });
    agents = result.agents;
    exitedCount += result.exitedCount;
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
      sinks = geometry.sinks;
      sources = geometry.sources;
      speedMetersPerSecond = geometry.speedMetersPerSecond;
      world = geometry.world;
      router = createRouter(world, geometry.walls);
      wallIndex = createWallIndex(geometry.walls);
      // Stranded agents (no exit left anywhere) leave the run but are not
      // exits: counting them would report an evacuation that never happened.
      agents = reconcileAgentsWithScene(agents, geometry);
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
      evacuationActive = false;
      evacuationStartedSeconds = 0;
      return makeSnapshot();
    },
    setEvacuation(active: boolean) {
      // Raised again after being stood down, the clock restarts: people react
      // to the alarm they can hear now, not to one from ten minutes ago.
      if (active && !evacuationActive) {
        evacuationStartedSeconds = elapsedSeconds;
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
