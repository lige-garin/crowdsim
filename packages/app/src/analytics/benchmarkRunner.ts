import { createSimulationEngineFromScene } from "../engine/simulationEngine";
import type {
  BenchmarkComparison,
  BenchmarkMetric,
  BenchmarkRunResult,
  BenchmarkScenario,
} from "./benchmarkTypes";
import {
  createSimulationRuntimeArtifact,
  formatSimulationRuntimeArtifact,
  type SimulationRuntimeArtifact,
} from "../engine/simulationRuntimeArtifact";

const defaultDensityCellSizeMeters = 4;

export type BenchmarkRunnerOptions = {
  densityCellSizeMeters?: number;
  runtime?: Partial<SimulationRuntimeArtifact>;
};

export function runBenchmarkScenario(
  scenario: BenchmarkScenario,
  options: BenchmarkRunnerOptions = {},
): BenchmarkRunResult {
  const fixedDtSeconds = scenario.simulation.fixedDtSeconds ?? 1 / 60;
  const totalSteps = Math.ceil(scenario.durationSeconds / fixedDtSeconds);
  const densityCellSizeMeters =
    options.densityCellSizeMeters ?? defaultDensityCellSizeMeters;
  const densityCellArea =
    densityCellSizeMeters > 0
      ? densityCellSizeMeters * densityCellSizeMeters
      : defaultDensityCellSizeMeters * defaultDensityCellSizeMeters;
  const engine = createSimulationEngineFromScene(scenario.scene, scenario.simulation);
  const runtime = createSimulationRuntimeArtifact(options.runtime);

  engine.start();

  let densityPeak = 0;
  let speedSampleCount = 0;
  let speedSum = 0;
  let snapshot = engine.snapshot();

  for (let index = 0; index < totalSteps; index++) {
    snapshot = engine.step(1);
    densityPeak = Math.max(
      densityPeak,
      calculatePeakCellDensity(
        snapshot.agents,
        scenario.scene.world.width,
        scenario.scene.world.height,
        densityCellSizeMeters,
        densityCellArea,
      ),
    );

    for (const agent of snapshot.agents) {
      speedSum += Math.hypot(agent.vx, agent.vy);
      speedSampleCount++;
    }
  }

  const elapsedSeconds = roundMetric(snapshot.elapsedSeconds);
  const meanSpeedMetersPerSecond =
    speedSampleCount > 0 ? roundMetric(speedSum / speedSampleCount) : 0;
  const throughputPerMinute =
    elapsedSeconds > 0 ? roundMetric((snapshot.exitedCount / elapsedSeconds) * 60) : 0;
  const metrics: Record<BenchmarkMetric, number> = {
    densityPeak: roundMetric(densityPeak),
    exitedCount: snapshot.exitedCount,
    meanSpeedMetersPerSecond,
    spawnedCount: snapshot.spawnedCount,
    throughputPerMinute,
  };
  const comparisons = scenario.expectations.map((expectation) =>
    compareMetric(expectation.metric, metrics[expectation.metric], expectation.range),
  );

  return {
    comparisons,
    densityPeak: metrics.densityPeak,
    durationSeconds: scenario.durationSeconds,
    elapsedSeconds,
    exitedCount: snapshot.exitedCount,
    meanSpeedMetersPerSecond,
    pass: comparisons.every((comparison) => comparison.pass),
    remainingAgents: snapshot.agentCount,
    reproducibilityHash: createBenchmarkHash(
      scenario.id,
      metrics,
      snapshot.stepCount,
      runtime,
    ),
    runtime,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    spawnedCount: snapshot.spawnedCount,
    stepCount: snapshot.stepCount,
    throughputPerMinute,
  };
}

export function runBenchmarkSuite(
  scenarios: readonly BenchmarkScenario[],
  options: BenchmarkRunnerOptions = {},
): BenchmarkRunResult[] {
  return scenarios.map((scenario) => runBenchmarkScenario(scenario, options));
}

function compareMetric(
  metric: BenchmarkMetric,
  actual: number,
  range: BenchmarkComparison["range"],
): BenchmarkComparison {
  const minPass = range.min === undefined || actual >= range.min;
  const maxPass = range.max === undefined || actual <= range.max;

  return {
    actual,
    metric,
    pass: minPass && maxPass,
    range,
  };
}

function calculatePeakCellDensity(
  agents: readonly { x: number; y: number }[],
  worldWidth: number,
  worldHeight: number,
  cellSizeMeters: number,
  cellArea: number,
) {
  if (agents.length === 0 || cellSizeMeters <= 0 || cellArea <= 0) {
    return 0;
  }

  const columns = Math.max(1, Math.ceil(worldWidth / cellSizeMeters));
  const rows = Math.max(1, Math.ceil(worldHeight / cellSizeMeters));
  const counts = new Uint16Array(columns * rows);
  let peakCount = 0;

  for (const agent of agents) {
    const column = clampIndex(Math.floor(agent.x / cellSizeMeters), columns);
    const row = clampIndex(Math.floor(agent.y / cellSizeMeters), rows);
    const index = row * columns + column;
    counts[index]++;
    peakCount = Math.max(peakCount, counts[index]);
  }

  return peakCount / cellArea;
}

function clampIndex(index: number, length: number) {
  return Math.max(0, Math.min(length - 1, index));
}

function createBenchmarkHash(
  scenarioId: string,
  metrics: Record<BenchmarkMetric, number>,
  stepCount: number,
  runtime: SimulationRuntimeArtifact,
) {
  const payload = [
    scenarioId,
    formatSimulationRuntimeArtifact(runtime),
    stepCount,
    metrics.spawnedCount,
    metrics.exitedCount,
    metrics.densityPeak.toFixed(4),
    metrics.meanSpeedMetersPerSecond.toFixed(4),
    metrics.throughputPerMinute.toFixed(4),
  ].join("|");

  return fnv1a32(payload);
}

function fnv1a32(input: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function roundMetric(value: number) {
  return Number(value.toFixed(4));
}
