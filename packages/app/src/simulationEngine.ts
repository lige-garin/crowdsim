import type { WallSegment } from "@crowdsim/core-gpu";
import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";
import {
  clampPointToWorld,
  constrainMovement,
  wallSegmentsFromScene,
  type SceneWorldBounds,
} from "./sceneGeometry";
import { calculateEnvironmentImpact } from "./environmentEffects";
import type { MovementBackend } from "./movementBackend";
import {
  applySimulationAgentDecisions,
  calculateSimulationDecisionTick,
  shouldRunDecisionTick,
  type SimulationAgentDecisionState,
  type SimulationAgentWalkProgress,
  type SimulationDecisionBackend,
  type SimulationServicePoint,
  type SimulationShop,
} from "./simulationDecisionBackend";
import { createMallCrowdDecisionBackend } from "./mallCrowdDecisionBackend";
import { weatherCrowdImpact } from "./weatherCrowdImpact";
import { createBrandStoresFromScene } from "./brandAttraction";
import { stepAgentsWithMovementBackend } from "./simulationMovementBridge";
import { buildNavigationFields, pointToCellId } from "./simulationEngineNavigation";
import { createSeededRng, samplePoisson } from "./simulationEngineRandom";
import { weidmannSpeedRatioAtDensity } from "./pedestrianFundamentalDiagram";
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
  /** Closest approach to the current walk target, used to detect a blocked route. */
  walkProgress?: SimulationAgentWalkProgress;
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
  targetSinkId?: string;
};
export type SimulationSource = {
  id: string;
  position: ScenePoint;
  width: number;
  arrivalRatePerSecond: number;
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
  movementBackend?: MovementBackend;
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
  stepAsync: (steps?: number) => Promise<SimulationSnapshot>;
  tick: (realDeltaSeconds: number) => SimulationSnapshot;
  tickAsync: (realDeltaSeconds: number) => Promise<SimulationSnapshot>;
};
const defaultFixedDtSeconds = 1 / 60;
const defaultMaxAgents = 2_000;
// Weidmann free-flow speed. Was 8 m/s (~29 km/h, 6x a walking human): every UI
// path simulates at this default because neither the controller nor the worker
// passes an explicit speed, so editor-built scenes ran at sprint pace. Must
// match the scene-schema default (sceneSchema speedMetersPerSecond).
const defaultSpeedMetersPerSecond = 1.34;
/**
 * Local crowd interaction on the CPU path — the three constants below are the
 * whole thing. Before this existed, `advanceAgentsCpu` moved every walker at a
 * fixed speed with no awareness of anybody else: density never slowed anyone
 * (RiMEA test 4 failed by +0.73 m/s at 2 P/m²) and agents walked straight
 * through each other, so jams, queues and arches could not form.
 *
 * The GPU core (`gpuSimCore`) already had this physics; this is the CPU
 * equivalent so the default, backend-less path behaves the same.
 */
const densityCellSizeMeters = 2;
/** Shoulder width: two walkers closer than this are overlapping, not walking. */
const agentSeparationMeters = 0.5;
/** Per-step cap on the separation push, so nobody is teleported out of a crowd. */
const maxSeparationStepMeters = 0.2;
const maxRealDeltaSeconds = 0.25;
export const simulationRuntimeProfile = {
  decisionBackend: "rule-ts",
  decisionHz: 10,
  maxAgents: defaultMaxAgents,
  movementBackend: "cpu-compat",
  movementHz: 60,
} as const;
export function createSimulationEngineFromScene(
  scene: CrowdSimScene,
  overrides: Partial<SimulationEngineConfig> = {},
): SimulationEngine {
  const environmentImpact = calculateEnvironmentImpact(scene, 0);
  // Precedence: explicit override > scene-persisted field > engine default
  // (which equals the schema default, so both fall in line at 1.34).
  const baseSpeed =
    overrides.speedMetersPerSecond ??
    scene.speedMetersPerSecond ??
    defaultSpeedMetersPerSecond;
  const sources = scene.entrances
    .filter((entrance) => entrance.kind !== "sink" && entrance.arrivalRatePerMinute > 0)
    .map((entrance) => ({
      id: entrance.id,
      position: entrance.position,
      width: entrance.width,
      arrivalRatePerSecond: entrance.arrivalRatePerMinute / 60,
    }));
  const sinks = scene.entrances
    .filter((entrance) => entrance.kind !== "source")
    .map((entrance) => ({
      id: entrance.id,
      position: entrance.position,
      radius: Math.max(1, entrance.width / 2),
    }));
  const weather = weatherCrowdImpact(environmentImpact);
  const shops: SimulationShop[] = scene.shops.map((shop) => ({
    id: shop.id,
    position: shop.entrancePosition ?? shop.position,
    radius: Math.max(2, Math.max(shop.size.width, shop.size.height) / 2),
    attraction: shop.attraction,
    dwellSeconds: shop.dwellMeanSeconds * weather.dwellMultiplier,
    capacity: shop.capacity,
    queuePosition: shop.queueAnchor ?? shop.entrancePosition ?? shop.position,
    conversionRate: shop.conversionRate,
  }));
  const servicePoints: SimulationServicePoint[] = scene.servicePoints.map(
    (servicePoint) => ({
      id: servicePoint.id,
      position: servicePoint.position,
      radius: Math.max(2, servicePoint.width / 2),
      serviceSeconds: servicePoint.serviceMeanSeconds,
    }),
  );
  const decisionBackend =
    overrides.decisionBackend ??
    createMallCrowdDecisionBackend({
      shops,
      seed: scene.seed,
      brandStores: createBrandStoresFromScene(scene),
    });
  return createSimulationEngine({
    seed: scene.seed,
    sources,
    sinks,
    walls: wallSegmentsFromScene(scene),
    world: scene.world,
    ...overrides,
    shops,
    servicePoints,
    decisionBackend,
    speedMetersPerSecond: baseSpeed * environmentImpact.speedMultiplier,
  });
}
export function createSimulationEngine(
  config: SimulationEngineConfig,
): SimulationEngine {
  const fixedDtSeconds = config.fixedDtSeconds ?? defaultFixedDtSeconds;
  const decisionBackend = config.decisionBackend;
  const maxAgents = config.maxAgents ?? defaultMaxAgents;
  const speedMetersPerSecond =
    config.speedMetersPerSecond ?? defaultSpeedMetersPerSecond;
  const sources = config.sources;
  const sinks = config.sinks;
  const shops = config.shops ?? [];
  const servicePoints = config.servicePoints ?? [];
  const movementBackend = config.movementBackend;
  const seed = config.seed ?? 1;
  const walls = config.walls ?? [];
  const world = config.world;
  const navigationFields = buildNavigationFields(world, walls, sinks);
  let rng = createSeededRng(seed);
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
  function spawnAgent(source: SimulationSource) {
    if (agents.length >= maxAgents || sinks.length === 0) {
      return;
    }
    const jitter = (rng() - 0.5) * source.width;
    const spawnPoint = clampPointToWorld(
      {
        x: source.position.x,
        y: source.position.y + jitter,
      },
      world,
    );
    const x = spawnPoint.x;
    const y = spawnPoint.y;
    const sink = nearestSink({ x, y });
    agents.push({
      id: nextAgentId++,
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
  function nearestSink(point: ScenePoint): SimulationSink {
    let best = sinks[0];
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    for (const sink of sinks) {
      const dx = sink.position.x - point.x;
      const dy = sink.position.y - point.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < bestDistanceSq) {
        best = sink;
        bestDistanceSq = distanceSq;
      }
    }
    return best;
  }
  function runFixedStep() {
    spawnArrivals();
    runDecisionTickIfNeeded();
    advanceAgentsCpu();
    elapsedSeconds += fixedDtSeconds;
    stepCount++;
  }
  async function runFixedStepAsync() {
    if (!movementBackend) {
      runFixedStep();
      return;
    }
    spawnArrivals();
    runDecisionTickIfNeeded();
    const result = await stepAgentsWithMovementBackend({
      agents,
      backend: movementBackend,
      canExit: isExitBound,
      fixedDtSeconds,
      sinks,
      speedMetersPerSecond,
      walls,
      world,
    });
    agents = result.agents;
    exitedCount += result.exitedCount;
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
    agents = applySimulationAgentDecisions(
      agents,
      decisionBackend.decideAgents({
        agents,
        decisionTick,
        elapsedSeconds,
        sinks,
        shops,
        servicePoints,
        evacuationActive,
      }),
      decisionTick,
    );
  }
  function spawnArrivals() {
    for (const source of sources) {
      const arrivals = samplePoisson(source.arrivalRatePerSecond * fixedDtSeconds, rng);
      for (let index = 0; index < arrivals; index++) {
        spawnAgent(source);
      }
    }
  }
  function advanceAgentsCpu() {
    const grid = buildAgentGrid(agents);
    const nextAgents: SimulationAgent[] = [];
    for (const agent of agents) {
      if (agent.lifecycleState === "browse" || agent.lifecycleState === "enterStore") {
        // Standing still, but they still take up space and still act as
        // obstacles: separate them too, otherwise a browsing crowd or a shop
        // queue collapses onto one anchor point and occupies no area.
        const settled = constrainMovement(
          agent,
          separateFromNeighbours(grid, agent, agent),
          walls,
          world,
        );

        nextAgents.push({
          ...agent,
          vx: (settled.x - agent.x) / fixedDtSeconds,
          vy: (settled.y - agent.y) / fixedDtSeconds,
          x: settled.x,
          y: settled.y,
        });
        continue;
      }
      const dx = agent.targetX - agent.x;
      const dy = agent.targetY - agent.y;
      const distance = Math.hypot(dx, dy);
      if (isExitBound(agent) && distance <= nearestSink(agent).radius) {
        exitedCount++;
        continue;
      }
      const direction = movementDirection(agent, dx, dy, distance);
      const density = localDensityPerSquareMeter(grid, agent.x, agent.y);
      const crowdSpeed = speedMetersPerSecond * weidmannSpeedRatioAtDensity(density);
      const travelDistance = Math.min(distance, crowdSpeed * fixedDtSeconds);
      const proposed = {
        x: agent.x + direction.x * travelDistance,
        y: agent.y + direction.y * travelDistance,
      };
      const separated = separateFromNeighbours(
        grid,
        agent,
        constrainMovement(agent, proposed, walls, world),
      );
      const resolved = constrainMovement(agent, separated, walls, world);
      const vx = (resolved.x - agent.x) / fixedDtSeconds;
      const vy = (resolved.y - agent.y) / fixedDtSeconds;
      nextAgents.push({
        ...agent,
        vx,
        vy,
        x: resolved.x,
        y: resolved.y,
      });
    }
    agents = nextAgents;
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
  function movementDirection(
    agent: SimulationAgent,
    dx: number,
    dy: number,
    distance: number,
  ) {
    if (agent.lifecycleState === "leave" || agent.lifecycleState === "evacuate") {
      const fieldDirection = sampleNavigationDirection(agent);
      if (fieldDirection) {
        return fieldDirection;
      }
    }
    const invDistance = distance > 0 ? 1 / distance : 0;
    return {
      x: dx * invDistance,
      y: dy * invDistance,
    };
  }
  function sampleNavigationDirection(agent: SimulationAgent) {
    if (!world || navigationFields.length === 0) {
      return undefined;
    }
    const field =
      navigationFields.find((candidate) => candidate.sinkId === agent.targetSinkId) ??
      navigationFields.find(
        (candidate) =>
          candidate.sinkId === nearestSink({ x: agent.targetX, y: agent.targetY }).id,
      );
    if (!field) {
      return undefined;
    }
    const cell = pointToCellId(agent, field.layout);
    const direction = {
      x: field.flowField.directions[cell * 2],
      y: field.flowField.directions[cell * 2 + 1],
    };
    return Math.hypot(direction.x, direction.y) > 0 ? direction : undefined;
  }
  return {
    pause() {
      status = "paused";
      return makeSnapshot();
    },
    reset() {
      rng = createSeededRng(seed);
      status = "paused";
      elapsedSeconds = 0;
      accumulatorSeconds = 0;
      stepCount = 0;
      timeScale = 1;
      nextAgentId = 1;
      spawnedCount = 0;
      exitedCount = 0;
      agents = [];
      evacuationActive = false;
      return makeSnapshot();
    },
    setEvacuation(active: boolean) {
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
    async stepAsync(steps = 1) {
      for (let index = 0; index < steps; index++) {
        await runFixedStepAsync();
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
    async tickAsync(realDeltaSeconds: number) {
      if (status !== "running") {
        return makeSnapshot();
      }
      accumulatorSeconds +=
        Math.min(Math.max(realDeltaSeconds, 0), maxRealDeltaSeconds) * timeScale;
      while (accumulatorSeconds >= fixedDtSeconds) {
        await runFixedStepAsync();
        accumulatorSeconds -= fixedDtSeconds;
      }
      return makeSnapshot();
    },
  };
}

/**
 * Local crowd interaction for the CPU path.
 *
 * HONESTY NOTE: the density here is a 3x3-cell sample of agent positions, not a
 * measurement of a real crowd, and the separation push is a positional
 * correction rather than a force. What this buys is the two properties that
 * were missing entirely: speed falls as local density rises (in Weidmann's
 * shape, see `pedestrianFundamentalDiagram`) and walkers no longer occupy the
 * same point. It is not a validated social-force model; `gpuSimCore` is.
 */
type AgentGrid = {
  agents: readonly SimulationAgent[];
  cellIds: Map<number, number[]>;
};

function buildAgentGrid(agents: readonly SimulationAgent[]): AgentGrid {
  const cellIds = new Map<number, number[]>();

  agents.forEach((agent, index) => {
    const cellId = gridCellId(agent.x, agent.y);
    const bucket = cellIds.get(cellId);

    if (bucket) {
      bucket.push(index);
    } else {
      cellIds.set(cellId, [index]);
    }
  });

  return { agents, cellIds };
}

function gridCellId(x: number, y: number) {
  const cx = Math.floor(x / densityCellSizeMeters) + 32768;
  const cy = Math.floor(y / densityCellSizeMeters) + 32768;

  return cx * 65536 + cy;
}

/**
 * Agents per square metre in the 3x3 neighbourhood around a point. The 3x3
 * window is the measurement area, so a lone walker reads as ~0.03 P/m² rather
 * than 1/36th of nothing: density has to be an area measurement to mean
 * anything against the literature curve.
 */
function localDensityPerSquareMeter(grid: AgentGrid, x: number, y: number) {
  let count = 0;

  forEachNeighbour(grid, x, y, () => count++);

  return count / (9 * densityCellSizeMeters * densityCellSizeMeters);
}

function forEachNeighbour(
  grid: AgentGrid,
  x: number,
  y: number,
  visit: (agent: SimulationAgent) => void,
) {
  const cx = Math.floor(x / densityCellSizeMeters);
  const cy = Math.floor(y / densityCellSizeMeters);

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const bucket = grid.cellIds.get(
        gridCellId(
          (cx + dx) * densityCellSizeMeters,
          (cy + dy) * densityCellSizeMeters,
        ),
      );

      if (!bucket) {
        continue;
      }

      for (const index of bucket) {
        visit(grid.agents[index]);
      }
    }
  }
}

/**
 * Push a walker out of anyone it overlaps. Neighbours are read at their
 * step-start positions (the grid is built once per step), so the result does
 * not depend on processing order and stays reproducible from a seed.
 */
function separateFromNeighbours(
  grid: AgentGrid,
  agent: SimulationAgent,
  position: ScenePoint,
): ScenePoint {
  let x = position.x;
  let y = position.y;

  forEachNeighbour(grid, x, y, (other) => {
    if (other.id === agent.id) {
      return;
    }

    const dx = x - other.x;
    const dy = y - other.y;
    const distanceSq = dx * dx + dy * dy;

    if (distanceSq >= agentSeparationMeters * agentSeparationMeters) {
      return;
    }

    const distance = Math.sqrt(distanceSq);

    // Exactly coincident walkers (a narrow gate can stack spawns on one point)
    // have no axis to separate along. Nudge them by a deterministic,
    // id-derived angle so the stack always breaks up instead of freezing.
    if (distance < 1e-6) {
      const angle = (agent.id * 2.399963) % (Math.PI * 2);

      x += Math.cos(angle) * maxSeparationStepMeters;
      y += Math.sin(angle) * maxSeparationStepMeters;
      return;
    }

    const push = Math.min(
      (agentSeparationMeters - distance) / 2,
      maxSeparationStepMeters,
    );

    x += (dx / distance) * push;
    y += (dy / distance) * push;
  });

  return { x, y };
}
