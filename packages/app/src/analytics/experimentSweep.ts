import type { BenchmarkScenario } from "./benchmarkTypes";
import { mulberry32 } from "../engine/simulationEngineRandom";
import type {
  ExperimentDefinition,
  ExperimentRunResult,
  ExperimentVariant,
} from "./experimentRunner";

export type SweepParameter =
  | {
      end: number;
      kind: "entrance-width";
      start: number;
      step: number;
      targetEntranceId: string;
    }
  | {
      end: number;
      kind: "max-agents" | "speed";
      start: number;
      step: number;
    };

export type MetricDistribution = {
  /**
   * A 95% confidence interval for the mean, or **null from a single run**.
   * One run has no spread to measure, and printing an interval for it would
   * claim a precision nobody measured.
   */
  ci95: { high: number; low: number } | null;
  max: number;
  mean: number;
  min: number;
  p50: number;
  p95: number;
  /** How many runs are behind the numbers above. */
  runs: number;
  samples: number[];
};

/** Resamples per bootstrap. 2,000 is the usual floor for a 95% interval. */
export const bootstrapResamples = 2000;

/**
 * A percentile bootstrap interval for the mean (Efron 1979): resample the runs
 * with replacement, take each resample's mean, and read the 2.5th and 97.5th
 * percentiles of those means.
 *
 * Chosen over a normal (mean ± 1.96·SE) interval because these metrics are not
 * symmetric — an evacuation time has a floor and a long tail — and the
 * bootstrap does not assume they are. It is seeded, so a report is
 * reproducible: the same runs give the same interval.
 *
 * **Null below two runs.** An interval needs a spread, and one number has none.
 */
export function bootstrapMeanInterval(
  samples: readonly number[],
  options: { resamples?: number; seed?: number } = {},
): { high: number; low: number } | null {
  if (samples.length < 2) {
    return null;
  }

  const resamples = options.resamples ?? bootstrapResamples;
  const random = mulberry32(options.seed ?? 1);
  const means: number[] = [];

  for (let draw = 0; draw < resamples; draw += 1) {
    let total = 0;

    for (let pick = 0; pick < samples.length; pick += 1) {
      total += samples[Math.floor(random() * samples.length)];
    }

    means.push(total / samples.length);
  }

  means.sort((left, right) => left - right);

  return {
    high: round(means[Math.min(means.length - 1, Math.ceil(0.975 * means.length) - 1)]),
    low: round(means[Math.max(0, Math.floor(0.025 * means.length))]),
  };
}

export function createExperimentFromSweep(options: {
  id: string;
  name: string;
  parameter: SweepParameter;
  replications: number;
  scenario: BenchmarkScenario;
}): ExperimentDefinition {
  return {
    id: options.id,
    name: options.name,
    replications: options.replications,
    scenario: options.scenario,
    variants: createSweepVariants(options.scenario, options.parameter),
  };
}

export function summarizeMonteCarloDistribution(
  results: readonly ExperimentRunResult[],
  metric: "exitedCount" | "throughputPerMinute" = "throughputPerMinute",
): Record<string, MetricDistribution> {
  const grouped = new Map<string, number[]>();

  for (const result of results) {
    const value =
      metric === "exitedCount"
        ? result.benchmark.exitedCount
        : result.benchmark.throughputPerMinute;

    grouped.set(result.variantId, [...(grouped.get(result.variantId) ?? []), value]);
  }

  return Object.fromEntries(
    [...grouped.entries()].map(([variantId, samples]) => [
      variantId,
      createDistribution(samples),
    ]),
  );
}

function createSweepVariants(
  scenario: BenchmarkScenario,
  parameter: SweepParameter,
): ExperimentVariant[] {
  return sweepValues(parameter).map((value) => {
    const label = `${parameter.kind}-${formatSweepValue(value)}`;

    if (parameter.kind === "speed") {
      return {
        id: label,
        name: `Speed ${value} m/s`,
        simulationOverrides: {
          speedMetersPerSecond: value,
        },
      };
    }

    if (parameter.kind === "max-agents") {
      return {
        id: label,
        name: `Max agents ${value}`,
        simulationOverrides: {
          maxAgents: value,
        },
      };
    }

    if (parameter.kind === "entrance-width") {
      return {
        id: label,
        name: `Entrance ${parameter.targetEntranceId} width ${value}m`,
        scene: {
          ...scenario.scene,
          entrances: scenario.scene.entrances.map((entrance) =>
            entrance.id === parameter.targetEntranceId
              ? {
                  ...entrance,
                  width: value,
                }
              : entrance,
          ),
        },
      };
    }

    throw new Error("Unsupported sweep parameter.");
  });
}

function sweepValues(parameter: SweepParameter) {
  const values: number[] = [];

  for (
    let value = parameter.start;
    value <= parameter.end + Number.EPSILON;
    value += parameter.step
  ) {
    values.push(Number(value.toFixed(4)));
  }

  return values;
}

function createDistribution(samples: readonly number[]): MetricDistribution {
  const sorted = [...samples].sort((left, right) => left - right);

  return {
    ci95: bootstrapMeanInterval(sorted),
    runs: sorted.length,
    max: round(sorted.at(-1) ?? 0),
    mean: round(
      sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length),
    ),
    min: round(sorted[0] ?? 0),
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    samples: sorted.map(round),
  };
}

function percentile(sortedSamples: readonly number[], percentileValue: number) {
  if (sortedSamples.length === 0) {
    return 0;
  }

  const index = Math.min(
    sortedSamples.length - 1,
    Math.ceil(percentileValue * sortedSamples.length) - 1,
  );

  return round(sortedSamples[index]);
}

function formatSweepValue(value: number) {
  return String(value).replace(".", "_");
}

function round(value: number) {
  return Number(value.toFixed(4));
}
