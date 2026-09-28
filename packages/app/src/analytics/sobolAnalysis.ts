import type { BenchmarkRunResult, BenchmarkScenario } from "./benchmarkTypes";
import { runBenchmarkScenario } from "./benchmarkRunner";
import type {
  ExperimentDefinition,
  ExperimentRunResult,
  ExperimentVariant,
} from "./experimentRunner";
import {
  defaultSocialForceScreeningParameters,
  toSocialForceOverrides,
  type ParameterPoint,
  type SensitivityParameter,
} from "./sensitivityAnalysis";
import { mean } from "../numberUtils";
import { mulberry32 } from "../engine/simulationEngineRandom";

/**
 * Sobol variance decomposition (Sobol' 1993/2001; sampled the Saltelli
 * 2002 way) — what `sensitivityAnalysis.ts`'s own module doc names as the
 * thing Morris screening does not do: decompose *how much* of the output's
 * total variance each parameter explains, alone (`S_i`, first order) and
 * including its interactions with every other parameter (`S_Ti`, total
 * order). `S_Ti - S_i > 0` for a parameter is itself the signal that it
 * interacts with something else, which nothing in a Morris-only screen can
 * show.
 *
 * A real, substantially more expensive method than Morris: this design
 * needs `sampleCount * (parameters.length + 2)` evaluations, against
 * Morris's `trajectoryCount * (parameters.length + 1)` — decomposing
 * variance needs the model evaluated with one parameter resampled while
 * every other parameter is held, in turn, at two different independently
 * drawn configurations (A and B), which a one-at-a-time screening
 * trajectory never constructs.
 */

export type SobolOptions = {
  /** Samples per parameter's own AB matrix — Saltelli's own N. More gives a
   * tighter estimate at `parameters.length + 2` more evaluations each. */
  sampleCount?: number;
  seed?: number;
};

const defaultSampleCount = 64;

function samplePoint(
  parameters: readonly SensitivityParameter[],
  rng: () => number,
): ParameterPoint {
  const point: Record<string, number> = {};
  for (const parameter of parameters) {
    point[parameter.id] = parameter.min + rng() * (parameter.max - parameter.min);
  }
  return point;
}

export type SobolSampleMatrices = {
  a: readonly ParameterPoint[];
  b: readonly ParameterPoint[];
  /** `ab[i]` is `a` with column `parameters[i].id` replaced by `b`'s own
   * column for that parameter — one matrix per parameter, Saltelli's own
   * design for isolating that parameter's contribution. */
  ab: readonly ParameterPoint[][];
};

export function generateSobolSamples(
  parameters: readonly SensitivityParameter[],
  options: SobolOptions = {},
): SobolSampleMatrices {
  const sampleCount = options.sampleCount ?? defaultSampleCount;
  const rng = mulberry32(options.seed ?? 1);

  const a = Array.from({ length: sampleCount }, () => samplePoint(parameters, rng));
  const b = Array.from({ length: sampleCount }, () => samplePoint(parameters, rng));

  const ab = parameters.map((parameter) =>
    a.map((rowA, index) => ({ ...rowA, [parameter.id]: b[index][parameter.id] })),
  );

  return { a, ab, b };
}

export type SobolSummary = {
  parameterId: string;
  /** S_i: share of output variance explained by this parameter alone. */
  firstOrder: number;
  /** S_Ti: share of output variance involving this parameter at all,
   * including interactions. Always >= firstOrder in principle; sampling
   * noise at a small `sampleCount` can occasionally invert that slightly,
   * which is itself a sign the estimate needs more samples, not hidden. */
  totalOrder: number;
  sampleCount: number;
};

function variance(values: readonly number[], meanValue: number): number {
  return mean(values.map((value) => (value - meanValue) ** 2));
}

/**
 * Sobol indices from already-computed outputs (matches `a`/`b`/`ab` row for
 * row) — separated from `runSobolAnalysis` the same way
 * `elementaryEffectsFromOutputs` is separated from `computeElementaryEffects`
 * in `sensitivityAnalysis.ts`: a live `evaluate` and outputs already
 * collected from a background worker both reduce to this one function, so
 * the two paths cannot drift apart.
 */
export function sobolIndicesFromOutputs(
  parameters: readonly SensitivityParameter[],
  outputsA: readonly number[],
  outputsB: readonly number[],
  outputsAb: readonly (readonly number[])[],
): SobolSummary[] {
  const combined = [...outputsA, ...outputsB];
  const combinedMean = mean(combined);
  const totalVariance = variance(combined, combinedMean);
  const sampleCount = outputsA.length;

  return parameters.map((parameter, index) => {
    const outputsAbI = outputsAb[index];
    let firstOrderSum = 0;
    let totalOrderSum = 0;
    for (let row = 0; row < sampleCount; row++) {
      firstOrderSum += outputsB[row] * (outputsAbI[row] - outputsA[row]);
      totalOrderSum += (outputsA[row] - outputsAbI[row]) ** 2;
    }
    return {
      firstOrder: totalVariance > 0 ? firstOrderSum / sampleCount / totalVariance : 0,
      parameterId: parameter.id,
      sampleCount,
      totalOrder:
        totalVariance > 0 ? totalOrderSum / (2 * sampleCount) / totalVariance : 0,
    };
  });
}

/** Trajectories generated and evaluated in one call — `evaluate` is called
 * `sampleCount * (parameters.length + 2)` times: once per row of `a`, `b`,
 * and every `ab[i]`. */
export function runSobolAnalysis(
  parameters: readonly SensitivityParameter[],
  evaluate: (point: ParameterPoint) => number,
  options: SobolOptions = {},
): SobolSummary[] {
  const { a, ab, b } = generateSobolSamples(parameters, options);
  const outputsA = a.map(evaluate);
  const outputsB = b.map(evaluate);
  const outputsAb = ab.map((rows) => rows.map(evaluate));
  return sobolIndicesFromOutputs(parameters, outputsA, outputsB, outputsAb);
}

export type SocialForceSobolResult = {
  evaluationCount: number;
  parameters: readonly SensitivityParameter[];
  summary: SobolSummary[];
};

/** The same social-force application `runSocialForceSensitivity` (Morris)
 * has, on the same default parameter set and screened range, so the two
 * methods' results are directly comparable. */
export function runSocialForceSobolAnalysis(
  scenario: BenchmarkScenario,
  options: SobolOptions & {
    metric?: (result: BenchmarkRunResult) => number;
    parameters?: readonly SensitivityParameter[];
  } = {},
): SocialForceSobolResult {
  const parameters = options.parameters ?? defaultSocialForceScreeningParameters;
  const metric =
    options.metric ?? ((result: BenchmarkRunResult) => result.throughputPerMinute);
  let evaluationCount = 0;

  const evaluate = (point: ParameterPoint): number => {
    evaluationCount += 1;
    const variantScenario: BenchmarkScenario = {
      ...scenario,
      id: `${scenario.id}__sobol-${evaluationCount}`,
      simulation: {
        ...scenario.simulation,
        movementParameters: toSocialForceOverrides(point),
      },
    };
    return metric(runBenchmarkScenario(variantScenario));
  };

  const summary = runSobolAnalysis(parameters, evaluate, options);

  return { evaluationCount, parameters, summary };
}

function sobolVariantId(kind: "a" | "b" | "ab", parameterIndex: number, row: number) {
  return kind === "ab" ? `ab${parameterIndex}-${row}` : `${kind}-${row}`;
}

/**
 * The same worker-experiment shape `buildMorrisExperiment` has, for the
 * same reason: every evaluation is a real benchmark run, so this belongs
 * on `runExperimentInBackgroundWorker` rather than the main thread.
 */
export function buildSobolExperiment(
  scenario: BenchmarkScenario,
  parameters: readonly SensitivityParameter[] = defaultSocialForceScreeningParameters,
  options: SobolOptions = {},
): { experiment: ExperimentDefinition; samples: SobolSampleMatrices } {
  const samples = generateSobolSamples(parameters, options);

  const variantFor = (
    kind: "a" | "b" | "ab",
    parameterIndex: number,
    row: number,
    point: ParameterPoint,
  ): ExperimentVariant => ({
    id: sobolVariantId(kind, parameterIndex, row),
    name: `${kind}${kind === "ab" ? parameterIndex : ""} row ${row}`,
    simulationOverrides: { movementParameters: toSocialForceOverrides(point) },
  });

  const variants: ExperimentVariant[] = [
    ...samples.a.map((point, row) => variantFor("a", -1, row, point)),
    ...samples.b.map((point, row) => variantFor("b", -1, row, point)),
    ...samples.ab.flatMap((rows, parameterIndex) =>
      rows.map((point, row) => variantFor("ab", parameterIndex, row, point)),
    ),
  ];

  return {
    experiment: {
      id: `${scenario.id}__sobol`,
      name: `${scenario.name} — Sobol variance decomposition`,
      replications: 1,
      scenario,
      variants,
    },
    samples,
  };
}

/** Reconstructs Sobol indices from a completed worker run — matches each
 * result back to its row by the id `buildSobolExperiment` gave it. */
export function summarizeSobolExperimentResults(
  parameters: readonly SensitivityParameter[],
  samples: SobolSampleMatrices,
  results: readonly ExperimentRunResult[],
  metric: (result: BenchmarkRunResult) => number = (result) =>
    result.throughputPerMinute,
): SobolSummary[] {
  const metricByVariantId = new Map(
    results.map((result) => [result.variantId, metric(result.benchmark)]),
  );
  const lookup = (id: string): number => {
    const value = metricByVariantId.get(id);
    if (value === undefined) {
      throw new Error(`missing Sobol result for variant '${id}'`);
    }
    return value;
  };

  const outputsA = samples.a.map((_, row) => lookup(sobolVariantId("a", -1, row)));
  const outputsB = samples.b.map((_, row) => lookup(sobolVariantId("b", -1, row)));
  const outputsAb = samples.ab.map((rows, parameterIndex) =>
    rows.map((_, row) => lookup(sobolVariantId("ab", parameterIndex, row))),
  );

  return sobolIndicesFromOutputs(parameters, outputsA, outputsB, outputsAb);
}
