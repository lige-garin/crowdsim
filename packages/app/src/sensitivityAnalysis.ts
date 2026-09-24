import { socialForceParameters, type SocialForceParameters } from "./crowdMovement";
import type { BenchmarkRunResult, BenchmarkScenario } from "./benchmarkTypes";
import { runBenchmarkScenario } from "./benchmarkRunner";
import type {
  ExperimentDefinition,
  ExperimentRunResult,
  ExperimentVariant,
} from "./experimentRunner";
import { mulberry32 } from "./simulationEngineRandom";

/**
 * Morris (1991) elementary-effects screening: "which parameters actually
 * move the result", cheaply — one-at-a-time steps along randomized
 * trajectories, not a full factorial or a fitted surrogate. This is a
 * general statistical procedure (the trajectory design and the elementary-
 * effect formula below), not a fitted model — unlike this project's several
 * self-authored, explicitly-not-a-citation constants elsewhere, "Morris
 * (1991)" here names the actual algorithm being run, faithfully, not a
 * borrowed name for a different or approximate one.
 *
 * Screening, not a full sensitivity study: it ranks parameters by how much
 * they move the metric and whether that effect looks roughly linear (a
 * small spread of elementary effects) or not (a wide one), which is what
 * "which three parameters determine the conclusion" is asking for. It does
 * not decompose *how much* of the output's variance each parameter
 * explains — that is Sobol indices, a different and much more expensive
 * method, not built here.
 */

export type SensitivityParameter = {
  id: string;
  min: number;
  max: number;
};

export type ParameterPoint = Readonly<Record<string, number>>;

/**
 * `ParameterPoint` is deliberately generic (`Record<string, number>`) so the
 * Morris-screening machinery below stays domain-agnostic -- it never reads a
 * parameter id, only passes them through. The two call sites that hand a
 * point to the social-force model, though, know their ids are always drawn
 * from `defaultSocialForceScreeningParameters`, i.e. always real
 * `SocialForceParameters` keys. This narrows that specific, known-safe
 * correspondence once, in one named place, instead of casting through
 * `unknown` at each call site.
 */
function toSocialForceOverrides(point: ParameterPoint): Partial<SocialForceParameters> {
  return point as Partial<Record<keyof SocialForceParameters, number>>;
}

export type MorrisTrajectory = {
  /** `parameters.length + 1` points; consecutive points differ in exactly
   * one parameter, by exactly one grid step. */
  points: ParameterPoint[];
  /** Which parameter changed between `points[i]` and `points[i + 1]`;
   * length `parameters.length`. */
  steppedParameterIds: string[];
};

export type MorrisOptions = {
  /** Trajectories to sample — Morris's own r. More gives a steadier
   * ranking at the cost of that many more evaluations per parameter. */
  trajectoryCount?: number;
  seed?: number;
};

/**
 * Discretization levels per parameter — Morris's own p. Fixed, not an
 * option: nothing in this project varies it, and even were a caller to want
 * one, it would need to stay even (the step size below, p/2 grid steps,
 * only lands on a grid point when it is). 4 is the value the method's own
 * literature most commonly uses.
 */
const levels = 4;
const defaultTrajectoryCount = 10;

function randomPermutation(length: number, rng: () => number): number[] {
  const order = Array.from({ length }, (_, index) => index);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function levelsToPoint(
  parameters: readonly SensitivityParameter[],
  levels: number,
  levelIndices: readonly number[],
): ParameterPoint {
  const point: Record<string, number> = {};
  parameters.forEach((parameter, index) => {
    const fraction = levelIndices[index] / (levels - 1);
    point[parameter.id] = parameter.min + fraction * (parameter.max - parameter.min);
  });
  return point;
}

/**
 * One Morris trajectory: a random base point with room for at least one
 * valid step in each parameter's own randomly chosen direction, then that
 * many one-at-a-time steps in a random order — the same construction
 * Morris's own B* matrix produces, written iteratively rather than as a
 * matrix product.
 */
function buildTrajectory(
  parameters: readonly SensitivityParameter[],
  levels: number,
  rng: () => number,
): MorrisTrajectory {
  const stepLevels = Math.floor(levels / 2);
  const direction: number[] = [];
  const levelIndices: number[] = [];

  for (let i = 0; i < parameters.length; i++) {
    const goingUp = rng() < 0.5;
    direction.push(goingUp ? 1 : -1);
    levelIndices.push(
      goingUp
        ? Math.floor(rng() * (levels - stepLevels))
        : stepLevels + Math.floor(rng() * (levels - stepLevels)),
    );
  }

  const order = randomPermutation(parameters.length, rng);
  const points: ParameterPoint[] = [levelsToPoint(parameters, levels, levelIndices)];
  const steppedParameterIds: string[] = [];

  for (const parameterIndex of order) {
    levelIndices[parameterIndex] += direction[parameterIndex] * stepLevels;
    points.push(levelsToPoint(parameters, levels, levelIndices));
    steppedParameterIds.push(parameters[parameterIndex].id);
  }

  return { points, steppedParameterIds };
}

export function generateMorrisTrajectories(
  parameters: readonly SensitivityParameter[],
  options: MorrisOptions = {},
): MorrisTrajectory[] {
  const trajectoryCount = options.trajectoryCount ?? defaultTrajectoryCount;
  const rng = mulberry32(options.seed ?? 1);

  return Array.from({ length: trajectoryCount }, () =>
    buildTrajectory(parameters, levels, rng),
  );
}

export type ElementaryEffect = {
  parameterId: string;
  effect: number;
};

/** The elementary effect of each step, given the trajectory's own points and
 * an output already computed for each one (in point order) — the change in
 * output divided by the change in whichever parameter moved, read directly
 * off the two points, so it needs no separate record of the step's own sign
 * or size. Shared by `computeElementaryEffects` (a live `evaluate`) and
 * `summarizeMorrisExperimentResults` (outputs already collected from a
 * worker run), so the two paths cannot drift apart. */
function elementaryEffectsFromOutputs(
  trajectory: MorrisTrajectory,
  outputs: readonly number[],
): ElementaryEffect[] {
  return trajectory.steppedParameterIds.map((parameterId, index) => {
    const before = trajectory.points[index];
    const after = trajectory.points[index + 1];
    const change = after[parameterId] - before[parameterId];
    const effect = (outputs[index + 1] - outputs[index]) / change;
    return { parameterId, effect };
  });
}

export function computeElementaryEffects(
  trajectory: MorrisTrajectory,
  evaluate: (point: ParameterPoint) => number,
): ElementaryEffect[] {
  return elementaryEffectsFromOutputs(trajectory, trajectory.points.map(evaluate));
}

export type MorrisSummary = {
  parameterId: string;
  /** μ*: mean of |effect| — Morris's own ranking statistic, robust to
   * effects of opposite sign cancelling each other out. */
  meanAbsoluteEffect: number;
  /** μ: the signed mean — which way the parameter pushes the metric. */
  meanEffect: number;
  /** σ: spread of the effect across trajectories — high relative to μ*
   * suggests a nonlinear or interacting effect, not merely a strong one. */
  stdDevEffect: number;
  sampleCount: number;
};

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: readonly number[], meanValue: number): number {
  if (values.length < 2) {
    return 0;
  }
  const variance =
    values.reduce((sum, value) => sum + (value - meanValue) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Ranked by μ* descending — the parameters that move the metric most come
 * first, which is what "the top three" means for this method. */
export function summarizeMorrisEffects(
  effects: readonly ElementaryEffect[],
): MorrisSummary[] {
  const byParameter = new Map<string, number[]>();
  for (const effect of effects) {
    byParameter.set(effect.parameterId, [
      ...(byParameter.get(effect.parameterId) ?? []),
      effect.effect,
    ]);
  }

  return [...byParameter.entries()]
    .map(([parameterId, values]) => {
      const meanEffect = mean(values);
      return {
        meanAbsoluteEffect: mean(values.map(Math.abs)),
        meanEffect,
        parameterId,
        sampleCount: values.length,
        stdDevEffect: stdDev(values, meanEffect),
      };
    })
    .sort((left, right) => right.meanAbsoluteEffect - left.meanAbsoluteEffect);
}

/** Trajectories, elementary effects and the ranked summary, in one call —
 * `evaluate` is called once per point of every trajectory
 * (`trajectoryCount * (parameters.length + 1)` times), each point reused as
 * both the "after" of one step and the "before" of the next rather than
 * evaluated twice. */
export function runMorrisScreening(
  parameters: readonly SensitivityParameter[],
  evaluate: (point: ParameterPoint) => number,
  options: MorrisOptions = {},
): MorrisSummary[] {
  const trajectories = generateMorrisTrajectories(parameters, options);
  const effects = trajectories.flatMap((trajectory) =>
    computeElementaryEffects(trajectory, evaluate),
  );
  return summarizeMorrisEffects(effects);
}

/**
 * A concrete application to this product: which of the social-force
 * model's own fitted constants (`crowdMovement.socialForceParameters`)
 * moves a scenario's throughput the most. Screened around each constant's
 * own fitted value, ±50% — wide enough to see an effect, not a claim about
 * a plausible calibration range.
 */
const defaultScreenedRangeFraction = 0.5;

function screenedRange(value: number): { min: number; max: number } {
  const span = Math.abs(value) * defaultScreenedRangeFraction;
  return { max: value + span, min: value - span };
}

export const defaultSocialForceScreeningParameters: readonly SensitivityParameter[] = [
  "relaxationSeconds",
  "agentStrength",
  "agentRangeMeters",
  "anisotropy",
  "wallStrength",
  "sidestep",
].map((id) => ({
  id,
  ...screenedRange(socialForceParameters[id as keyof SocialForceParameters]),
}));

export type SocialForceSensitivityResult = {
  evaluationCount: number;
  parameters: readonly SensitivityParameter[];
  summary: MorrisSummary[];
};

/** Runs `runBenchmarkScenario` once per elementary-effect step, varying
 * only `simulation.movementParameters` — everything else about the
 * scenario (scene, seed, duration) stays exactly as given. */
export function runSocialForceSensitivity(
  scenario: BenchmarkScenario,
  options: MorrisOptions & {
    metric?: (result: BenchmarkRunResult) => number;
    parameters?: readonly SensitivityParameter[];
  } = {},
): SocialForceSensitivityResult {
  const parameters = options.parameters ?? defaultSocialForceScreeningParameters;
  const metric =
    options.metric ?? ((result: BenchmarkRunResult) => result.throughputPerMinute);
  let evaluationCount = 0;

  const evaluate = (point: ParameterPoint): number => {
    evaluationCount += 1;
    const variantScenario: BenchmarkScenario = {
      ...scenario,
      id: `${scenario.id}__morris-${evaluationCount}`,
      simulation: {
        ...scenario.simulation,
        movementParameters: toSocialForceOverrides(point),
      },
    };
    return metric(runBenchmarkScenario(variantScenario));
  };

  // Run first, assign after: an object literal reads `evaluationCount`'s
  // value at that point in construction, not lazily, so listing it before
  // this call in the literal would capture 0 rather than the real count.
  const summary = runMorrisScreening(parameters, evaluate, options);

  return { evaluationCount, parameters, summary };
}

/**
 * The same screening as `runSocialForceSensitivity`, but as an
 * `ExperimentDefinition` for `runExperimentInBackgroundWorker` — every
 * evaluation this method needs (`trajectoryCount * (parameters.length + 1)`
 * benchmark runs) is real simulation time, the same reason
 * `ExperimentSweepPanel` moved off the main thread rather than running
 * synchronously. Each trajectory point becomes one variant
 * (`replications: 1` — Morris's own design already spreads its sampling
 * across trajectories, not repeats of one point); `summarizeMorrisExperimentResults`
 * turns the worker's results back into a ranking once they return.
 */
export function buildMorrisExperiment(
  scenario: BenchmarkScenario,
  parameters: readonly SensitivityParameter[] = defaultSocialForceScreeningParameters,
  options: MorrisOptions = {},
): { experiment: ExperimentDefinition; trajectories: MorrisTrajectory[] } {
  const trajectories = generateMorrisTrajectories(parameters, options);
  const variants: ExperimentVariant[] = trajectories.flatMap(
    (trajectory, trajectoryIndex) =>
      trajectory.points.map((point, pointIndex) => ({
        id: morrisVariantId(trajectoryIndex, pointIndex),
        name: `trajectory ${trajectoryIndex}, point ${pointIndex}`,
        simulationOverrides: {
          movementParameters: toSocialForceOverrides(point),
        },
      })),
  );

  return {
    experiment: {
      id: `${scenario.id}__morris`,
      name: `${scenario.name} — Morris screening`,
      replications: 1,
      scenario,
      variants,
    },
    trajectories,
  };
}

function morrisVariantId(trajectoryIndex: number, pointIndex: number): string {
  return `t${trajectoryIndex}-p${pointIndex}`;
}

/** Reconstructs the elementary-effects summary from a completed worker run
 * — matches each result back to its trajectory and point by the id
 * `buildMorrisExperiment` gave it, in the same order the trajectories were
 * generated in, so the two must come from the same `buildMorrisExperiment`
 * call. */
export function summarizeMorrisExperimentResults(
  trajectories: readonly MorrisTrajectory[],
  results: readonly ExperimentRunResult[],
  metric: (result: BenchmarkRunResult) => number = (result) =>
    result.throughputPerMinute,
): MorrisSummary[] {
  const metricByVariantId = new Map(
    results.map((result) => [result.variantId, metric(result.benchmark)]),
  );

  const effects = trajectories.flatMap((trajectory, trajectoryIndex) => {
    const outputs = trajectory.points.map((_, pointIndex) => {
      const value = metricByVariantId.get(morrisVariantId(trajectoryIndex, pointIndex));
      if (value === undefined) {
        throw new Error(
          `missing result for trajectory ${trajectoryIndex} point ${pointIndex}`,
        );
      }
      return value;
    });
    return elementaryEffectsFromOutputs(trajectory, outputs);
  });

  return summarizeMorrisEffects(effects);
}
