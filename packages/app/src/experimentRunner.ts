import type { SimulationEngineConfig } from "./simulationEngine";
import { runBenchmarkScenario } from "./benchmarkRunner";
import type { BenchmarkRunResult, BenchmarkScenario } from "./benchmarkTypes";

export type ExperimentVariant = {
  id: string;
  name: string;
  scene?: BenchmarkScenario["scene"];
  seedOffset?: number;
  simulationOverrides?: Partial<SimulationEngineConfig>;
};

export type ExperimentDefinition = {
  id: string;
  name: string;
  replications: number;
  scenario: BenchmarkScenario;
  variants: readonly ExperimentVariant[];
};

export type ExperimentRunResult = {
  benchmark: BenchmarkRunResult;
  experimentId: string;
  replicationIndex: number;
  variantId: string;
  variantName: string;
};

export type ExperimentSummary = {
  exitedCountMean: number;
  exitedCountStdDev: number;
  passRate: number;
  replicationCount: number;
  throughputMean: number;
  throughputStdDev: number;
  variantId: string;
  variantName: string;
};

export function runExperiment(experiment: ExperimentDefinition): ExperimentRunResult[] {
  const replications = Math.max(1, Math.floor(experiment.replications));
  const results: ExperimentRunResult[] = [];

  for (const variant of experiment.variants) {
    for (
      let replicationIndex = 0;
      replicationIndex < replications;
      replicationIndex++
    ) {
      const scenario = createVariantScenario(
        experiment.scenario,
        variant,
        replicationIndex,
      );

      results.push({
        benchmark: runBenchmarkScenario(scenario),
        experimentId: experiment.id,
        replicationIndex,
        variantId: variant.id,
        variantName: variant.name,
      });
    }
  }

  return results;
}

export function summarizeExperimentResults(
  results: readonly ExperimentRunResult[],
): ExperimentSummary[] {
  const grouped = new Map<string, ExperimentRunResult[]>();

  for (const result of results) {
    grouped.set(result.variantId, [...(grouped.get(result.variantId) ?? []), result]);
  }

  return [...grouped.entries()].map(([variantId, items]) => {
    const throughputs = items.map((item) => item.benchmark.throughputPerMinute);
    const exitedCounts = items.map((item) => item.benchmark.exitedCount);

    return {
      exitedCountMean: mean(exitedCounts),
      exitedCountStdDev: stdDev(exitedCounts),
      passRate: round(
        items.filter((item) => item.benchmark.pass).length / Math.max(1, items.length),
      ),
      replicationCount: items.length,
      throughputMean: mean(throughputs),
      throughputStdDev: stdDev(throughputs),
      variantId,
      variantName: items[0]?.variantName ?? variantId,
    };
  });
}

export function rankExperimentVariants(
  summaries: readonly ExperimentSummary[],
  metric: "exitedCountMean" | "passRate" | "throughputMean" = "throughputMean",
) {
  return [...summaries].sort((left, right) => right[metric] - left[metric]);
}

function createVariantScenario(
  scenario: BenchmarkScenario,
  variant: ExperimentVariant,
  replicationIndex: number,
): BenchmarkScenario {
  const seedOffset = variant.seedOffset ?? 0;
  const seed = scenario.scene.seed + seedOffset + replicationIndex;

  return {
    ...scenario,
    id: `${scenario.id}__${variant.id}__${replicationIndex}`,
    name: `${scenario.name} / ${variant.name} #${replicationIndex + 1}`,
    scene: {
      ...(variant.scene ?? scenario.scene),
      seed,
    },
    simulation: {
      ...scenario.simulation,
      ...variant.simulationOverrides,
      seed,
    },
  };
}

function mean(values: readonly number[]) {
  if (values.length === 0) {
    return 0;
  }

  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function stdDev(values: readonly number[]) {
  if (values.length < 2) {
    return 0;
  }

  const average = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;

  return round(Math.sqrt(variance));
}

function round(value: number) {
  return Number(value.toFixed(4));
}
