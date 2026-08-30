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

/**
 * Where the numbers in a `BenchmarkExpectation` come from.
 *
 * "self-authored" means the range was chosen to bracket what this engine
 * currently produces. Such a range is a regression guard -- it fires when the
 * behaviour changes -- and proves nothing about correctness. A range that was
 * fitted to the engine cannot fail while the engine stays the same, which is
 * why the source has to be recorded next to the numbers.
 *
 * "literature" means the range is quoted from a published source; the
 * expectation must then carry a `reference`.
 */
export type BenchmarkExpectationSource = "literature" | "self-authored";

export type BenchmarkExpectation = {
  metric: BenchmarkMetric;
  /**
   * Citation for a literature range, e.g. "Weidmann 1993". Omitted for
   * self-authored ranges, which have nothing to cite.
   */
  reference?: string;
  range: BenchmarkRange;
  source: BenchmarkExpectationSource;
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
