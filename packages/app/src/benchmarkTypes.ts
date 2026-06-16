import type { CrowdSimScene } from "@crowdsim/scene-schema";
import type { SimulationEngineConfig } from "./simulationEngine";
import type { SimulationRuntimeArtifact } from "./simulationRuntimeArtifact";

export type BenchmarkMetric =
  | "densityPeak"
  | "exitedCount"
  | "meanSpeedMetersPerSecond"
  | "spawnedCount"
  | "throughputPerMinute";

export type BenchmarkRange = {
  max?: number;
  min?: number;
};

export type BenchmarkExpectation = {
  metric: BenchmarkMetric;
  range: BenchmarkRange;
};

export type BenchmarkScenario = {
  description: string;
  durationSeconds: number;
  expectations: BenchmarkExpectation[];
  id: string;
  name: string;
  scene: CrowdSimScene;
  simulation: Partial<SimulationEngineConfig>;
  tags: string[];
};

export type BenchmarkComparison = {
  actual: number;
  metric: BenchmarkMetric;
  pass: boolean;
  range: BenchmarkRange;
};

export type BenchmarkRunResult = {
  comparisons: BenchmarkComparison[];
  densityPeak: number;
  durationSeconds: number;
  elapsedSeconds: number;
  exitedCount: number;
  meanSpeedMetersPerSecond: number;
  pass: boolean;
  remainingAgents: number;
  reproducibilityHash: string;
  runtime: SimulationRuntimeArtifact;
  scenarioId: string;
  scenarioName: string;
  spawnedCount: number;
  stepCount: number;
  throughputPerMinute: number;
};
