import type { WallSegment } from "@crowdsim/core-gpu";
import { sampleBodyRadius, sampleSpeedFactor } from "./behaviorDistributions";
import { stepCrowd } from "./crowdMovement";
import {
  measureCorridorSpeed,
  runPeriodicCorridor,
  type CorridorOptions,
} from "./fundamentalDiagramHarness";
import { stepCrowdMoussaid } from "./moussaidHeuristic";
import { stepCrowdOrca } from "./orcaAvoidance";
import { weidmannFundamentalDiagram } from "./pedestrianFundamentalDiagram";
import type { SimulationAgent } from "./simulationEngine";
import { createWallIndex, type WallIndex } from "./wallIndex";

/**
 * Social force vs ORCA vs Moussaïd's heuristic, on this project's own
 * existing benchmarks — see `docs/adr/0013-orca-comparison-layer.md` and
 * `docs/adr/0014-moussaid-heuristic-comparison-layer.md` for why each
 * exists and what they do and do not claim. Nothing here changes the
 * social-force side: the fundamental-diagram measurement calls the same,
 * unmodified `measureCorridorSpeed` every other benchmark in this project
 * already uses; the other two models' own measurements are new code, run
 * through the exact same harness functions.
 */

type StepFn = (input: {
  agents: readonly SimulationAgent[];
  dtSeconds: number;
  walls: WallIndex;
  meanSpeedMetersPerSecond: number;
}) => readonly SimulationAgent[];

/** Straight line-of-sight to the target — no pathfinding, matching
 * `fundamentalDiagramHarness.ts`'s own `straightAhead` router for these simple,
 * obstacle-light benchmark scenes. */
function seekTarget(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  return d > 1e-9 ? { x: dx / d, y: dy / d } : { x: 0, y: 0 };
}

const socialForceStep: StepFn = (input) =>
  stepCrowd({
    agents: input.agents,
    dtSeconds: input.dtSeconds,
    exitRadius: () => 0,
    isExitBound: () => false,
    meanSpeedMetersPerSecond: input.meanSpeedMetersPerSecond,
    router: { direction: seekTarget },
    seed: 1,
    walls: input.walls,
  }).agents;

const orcaStep: StepFn = (input) =>
  stepCrowdOrca({
    agents: input.agents,
    dtSeconds: input.dtSeconds,
    meanSpeedMetersPerSecond: input.meanSpeedMetersPerSecond,
    walls: input.walls,
    isExitBound: () => false,
    exitRadius: () => 0,
  }).agents;

const moussaidStep: StepFn = (input) =>
  stepCrowdMoussaid({
    agents: input.agents,
    dtSeconds: input.dtSeconds,
    meanSpeedMetersPerSecond: input.meanSpeedMetersPerSecond,
    walls: input.walls,
    isExitBound: () => false,
    exitRadius: () => 0,
  }).agents;

/**
 * The ORCA/Moussaïd side of the fundamental diagram: `runPeriodicCorridor`
 * (`fundamentalDiagramHarness.ts`) — the exact same periodic-corridor loop
 * `measureCorridorSpeed` calls for social force — stepped with the other
 * model's own step function instead.
 */
export function measureCorridorSpeedOrca(
  densityPerSquareMeter: number,
  options: CorridorOptions = {},
): number {
  return runPeriodicCorridor(orcaStep, densityPerSquareMeter, options);
}

export function measureCorridorSpeedMoussaid(
  densityPerSquareMeter: number,
  options: CorridorOptions = {},
): number {
  return runPeriodicCorridor(moussaidStep, densityPerSquareMeter, options);
}

/**
 * A room filling to a bottleneck, run under whichever `step` is given:
 * `bottleneckTest`'s own room size, headcount and default gap width
 * (`rimeaSuite.ts`) reused for the geometry, but at the lightweight
 * `stepCrowd`/`stepCrowdOrca` level every other harness in this file uses —
 * no scene schema, decision backend or exits. Specific flow is people
 * crossing the gap's own plane per second per metre of its width, over a
 * fixed window after a warmup — the same quantity `weidmannMaxSpecificFlow`
 * names for a single doorway.
 */
export function measureBottleneckFlow(
  step: StepFn,
  options: {
    roomSizeMeters?: number;
    gapWidthMeters?: number;
    people?: number;
    dtSeconds?: number;
    warmupSeconds?: number;
    measureSeconds?: number;
    seed?: number;
  } = {},
): number {
  const size = options.roomSizeMeters ?? 10;
  const gapWidth = options.gapWidthMeters ?? 2.4;
  const people = options.people ?? 150;
  const dt = options.dtSeconds ?? 1 / 60;
  const seed = options.seed ?? 1;
  const meanSpeed = weidmannFundamentalDiagram.freeFlowSpeedMetersPerSecond;
  const midY = size / 2;
  const halfGap = gapWidth / 2;
  const wallSegments: WallSegment[] = [
    { x1: 0, y1: 0, x2: size, y2: 0 },
    { x1: 0, y1: size, x2: size, y2: size },
    { x1: 0, y1: 0, x2: 0, y2: size },
    { x1: size, y1: 0, x2: size, y2: midY - halfGap },
    { x1: size, y1: midY + halfGap, x2: size, y2: size },
  ];
  const walls = createWallIndex(wallSegments);

  const columns = Math.max(1, Math.ceil(Math.sqrt(people)));
  const rows = Math.max(1, Math.ceil(people / columns));
  let agents: SimulationAgent[] = Array.from({ length: people }, (_, index) => {
    const id = index + 1;
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      id,
      radius: sampleBodyRadius(seed, id),
      speedFactor: sampleSpeedFactor(seed, id),
      targetX: size + 100,
      targetY: midY,
      vx: 0,
      vy: 0,
      x: ((column + 0.5) / columns) * (size * 0.8),
      y: ((row + 0.5) / rows) * size,
    };
  });

  const warmupSteps = Math.round((options.warmupSeconds ?? 5) / dt);
  const measureSteps = Math.round((options.measureSeconds ?? 15) / dt);
  const crossed = new Set<number>();
  let crossedDuringWindow = 0;

  for (let stepIndex = 0; stepIndex < warmupSteps + measureSteps; stepIndex++) {
    agents = step({
      agents,
      dtSeconds: dt,
      walls,
      meanSpeedMetersPerSecond: meanSpeed,
    }) as SimulationAgent[];

    for (const agent of agents) {
      if (agent.x >= size && !crossed.has(agent.id)) {
        crossed.add(agent.id);
        if (stepIndex >= warmupSteps) crossedDuringWindow++;
      }
    }
  }

  const windowSeconds = measureSteps * dt;
  return crossedDuringWindow / windowSeconds / gapWidth;
}

/**
 * The passing-distance setup `crowdMovement.test.ts`'s own `headOnPassing`
 * uses (two people, 20 m apart, 0.1 m lateral offset, walking straight at
 * each other), run under whichever `step` is given: how close their
 * centres come before they pass.
 */
export function measurePassingDistance(step: StepFn, seconds = 15): number {
  const walls = createWallIndex([]);
  let agents: SimulationAgent[] = [
    {
      id: 1,
      x: 5,
      y: 10.05,
      vx: 1.3,
      vy: 0,
      targetX: 35,
      targetY: 10.05,
      radius: 0.23,
      speedFactor: 1,
    },
    {
      id: 2,
      x: 25,
      y: 9.95,
      vx: -1.3,
      vy: 0,
      targetX: -5,
      targetY: 9.95,
      radius: 0.23,
      speedFactor: 1,
    },
  ];

  let tightest = Infinity;
  const dt = 1 / 60;
  for (let stepIndex = 0; stepIndex < seconds * 60; stepIndex++) {
    agents = step({
      agents,
      dtSeconds: dt,
      walls,
      meanSpeedMetersPerSecond: weidmannFundamentalDiagram.freeFlowSpeedMetersPerSecond,
    }) as SimulationAgent[];
    const [a, b] = agents;
    tightest = Math.min(tightest, Math.hypot(a.x - b.x, a.y - b.y));
  }

  return tightest;
}

export type OrcaComparisonResult = {
  fundamentalDiagram: {
    density: number;
    socialForce: number;
    orca: number;
    moussaid: number;
  }[];
  bottleneckSpecificFlow: { socialForce: number; orca: number; moussaid: number };
  passingDistanceMeters: { socialForce: number; orca: number; moussaid: number };
};

/**
 * Runs the three benchmarks under all three models and returns each side.
 * The fundamental-diagram densities are a short list, not this project's
 * full seven-point RiMEA sweep (`fundamentalDiagramDensities`) — a
 * comparison snapshot, not a second copy of that regression.
 */
export function runOrcaComparison(
  densities: readonly number[] = [0.5, 1, 2, 3, 4],
): OrcaComparisonResult {
  const fundamentalDiagram = densities.map((density) => ({
    density,
    socialForce: measureCorridorSpeed(density, {}),
    orca: measureCorridorSpeedOrca(density),
    moussaid: measureCorridorSpeedMoussaid(density),
  }));

  return {
    fundamentalDiagram,
    bottleneckSpecificFlow: {
      socialForce: measureBottleneckFlow(socialForceStep),
      orca: measureBottleneckFlow(orcaStep),
      moussaid: measureBottleneckFlow(moussaidStep),
    },
    passingDistanceMeters: {
      socialForce: measurePassingDistance(socialForceStep),
      orca: measurePassingDistance(orcaStep),
      moussaid: measurePassingDistance(moussaidStep),
    },
  };
}
