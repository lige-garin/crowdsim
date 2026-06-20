import {
  createFlowFieldCpu,
  createSpatialHashGridLayout,
  rasterizeWallsToBlockedCells,
  type FlowField,
  type SpatialHashGridLayout,
  type WallSegment,
} from "@crowdsim/core-gpu";
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
  type SimulationDecisionBackend,
  type SimulationShop,
} from "./simulationDecisionBackend";
import { createMallCrowdDecisionBackend } from "./mallCrowdDecisionBackend";
import { stepAgentsWithMovementBackend } from "./simulationMovementBridge";

export type SimulationStatus = "paused" | "running";

export type SimulationAgent = {
  decisionTick?: number;
  id: number;
  lifecycleState?: SimulationAgentDecisionState;
  selectedStoreId?: string;
  /** When browsing a shop, the sim time at which the dwell ends and the agent leaves. */
  browseUntilSeconds?: number;
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
const defaultSpeedMetersPerSecond = 8;
const maxRealDeltaSeconds = 0.25;
const navigationCellSize = 2;

export const simulationRuntimeProfile = {
  decisionBackend: "rule-ts",
  decisionHz: 10,
  maxAgents: defaultMaxAgents,
  movementBackend: "cpu-compat",
  movementHz: 60,
} as const;

type SinkNavigationField = {
  flowField: FlowField;
  layout: SpatialHashGridLayout;
  sinkId: string;
};

export function createSimulationEngineFromScene(
  scene: CrowdSimScene,
  overrides: Partial<SimulationEngineConfig> = {},
): SimulationEngine {
  const environmentImpact = calculateEnvironmentImpact(scene, 0);
  const baseSpeed = overrides.speedMetersPerSecond ?? defaultSpeedMetersPerSecond;
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

  const shops: SimulationShop[] = scene.shops.map((shop) => ({
    id: shop.id,
    // Prefer the shop entrance (reachable, at the building edge) over the centre,
    // which can sit inside a wall.
    position: shop.entrancePosition ?? shop.position,
    radius: Math.max(2, Math.max(shop.size.width, shop.size.height) / 2),
    attraction: shop.attraction,
    dwellSeconds: shop.dwellMeanSeconds,
    capacity: shop.capacity,
    queuePosition: shop.queueAnchor ?? shop.entrancePosition ?? shop.position,
  }));
  // Default to the rule-based mall-crowd behaviour (enter -> shop -> browse ->
  // leave) so the crowd moves with a reason; callers may override.
  const decisionBackend =
    overrides.decisionBackend ??
    createMallCrowdDecisionBackend({ shops, seed: scene.seed });

  return createSimulationEngine({
    seed: scene.seed,
    sources,
    sinks,
    walls: wallSegmentsFromScene(scene),
    world: scene.world,
    ...overrides,
    shops,
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
    const nextAgents: SimulationAgent[] = [];

    for (const agent of agents) {
      // Browsing shoppers dwell in place until their decision flips to "leave".
      if (agent.lifecycleState === "browse") {
        nextAgents.push({ ...agent, vx: 0, vy: 0 });
        continue;
      }

      const dx = agent.targetX - agent.x;
      const dy = agent.targetY - agent.y;
      const distance = Math.hypot(dx, dy);

      // Exit on reaching the sink, unless heading to a shop or queuing for one.
      // Agents with no decision backend head straight to the sink and still exit.
      const headingToShop =
        agent.lifecycleState === "walk" || agent.lifecycleState === "queue";
      if (!headingToShop && distance <= nearestSink(agent).radius) {
        exitedCount++;
        continue;
      }

      const direction = movementDirection(agent, dx, dy, distance);
      const travelDistance = Math.min(distance, speedMetersPerSecond * fixedDtSeconds);
      const proposed = {
        x: agent.x + direction.x * travelDistance,
        y: agent.y + direction.y * travelDistance,
      };
      const resolved = constrainMovement(agent, proposed, walls, world);
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

  function movementDirection(
    agent: SimulationAgent,
    dx: number,
    dy: number,
    distance: number,
  ) {
    // The flow field only knows routes to sinks, so use it only when leaving;
    // a shopper walking to a shop steers straight at the shop.
    if (agent.lifecycleState === "leave") {
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

function buildNavigationFields(
  world: SceneWorldBounds | undefined,
  walls: readonly WallSegment[],
  sinks: readonly SimulationSink[],
): SinkNavigationField[] {
  if (!world || walls.length === 0 || sinks.length === 0) {
    return [];
  }

  const layout = createSpatialHashGridLayout({
    width: world.width,
    height: world.height,
    cellSize: navigationCellSize,
  });
  const blocked = rasterizeWallsToBlockedCells(layout, [...walls]);

  return sinks.map((sink) => {
    const sinkCell = pointToCellId(sink.position, layout);
    const sinkBlocked = new Uint8Array(blocked);
    sinkBlocked[sinkCell] = 0;

    return {
      flowField: createFlowFieldCpu({
        layout,
        targetCell: sinkCell,
        blocked: sinkBlocked,
      }),
      layout,
      sinkId: sink.id,
    };
  });
}

function pointToCellId(point: ScenePoint, layout: SpatialHashGridLayout): number {
  const column = clamp(Math.floor(point.x / layout.cellSize), 0, layout.columns - 1);
  const row = clamp(Math.floor(point.y / layout.cellSize), 0, layout.rows - 1);

  return row * layout.columns + column;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function samplePoisson(lambda: number, rng: () => number): number {
  if (lambda <= 0) {
    return 0;
  }

  const limit = Math.exp(-lambda);
  let product = 1;
  let count = 0;

  do {
    count++;
    product *= rng();
  } while (product > limit);

  return count - 1;
}

function createSeededRng(seed: number) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}
