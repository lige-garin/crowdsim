import type { SocialForceParameters } from "./crowdMovement";
import {
  measureCorridorSpeed,
  type CorridorOptions,
} from "./fundamentalDiagramHarness";

/**
 * Fit the social-force parameters so the speed–density relation the model
 * produces in a looped corridor matches a published fundamental diagram.
 *
 * This replaces nothing in `socialForceCalibration.ts`, which scales parameters
 * by a speed ratio and is not a fit. Here the model is actually run at each
 * density, compared with the reference curve, and a bounded Nelder–Mead search
 * moves the parameters to reduce the root-mean-square speed error.
 */
export type FittedParameterName =
  | "agentStrength"
  | "agentRangeMeters"
  | "anisotropy"
  | "relaxationSeconds";

export const fitBounds: Record<FittedParameterName, readonly [number, number]> = {
  agentStrength: [0.3, 12],
  agentRangeMeters: [0.08, 0.9],
  anisotropy: [0.05, 1],
  relaxationSeconds: [0.25, 1.2],
};

const names = Object.keys(fitBounds) as FittedParameterName[];

export type FitTarget = {
  densities: readonly number[];
  /** Reference walking speed at a density, m/s. */
  speedAt: (density: number) => number;
};

export type FitResult = {
  evaluations: number;
  parameters: Record<FittedParameterName, number>;
  rmse: number;
};

/** Root-mean-square speed error of a parameter set against a reference curve. */
export function speedRmse(
  parameters: Partial<SocialForceParameters>,
  target: FitTarget,
  options: CorridorOptions & { seeds?: readonly number[] } = {},
) {
  const seeds = options.seeds ?? [1];
  let sumSq = 0;
  let count = 0;
  for (const density of target.densities) {
    for (const seed of seeds) {
      const measured = measureCorridorSpeed(density, parameters, { ...options, seed });
      sumSq += (measured - target.speedAt(density)) ** 2;
      count++;
    }
  }
  return Math.sqrt(sumSq / Math.max(1, count));
}

/** Bounded Nelder–Mead in the unit cube (each parameter scaled to its bounds). */
export function fitSocialForce(
  start: Record<FittedParameterName, number>,
  target: FitTarget,
  options: CorridorOptions & {
    seeds?: readonly number[];
    maxEvaluations?: number;
    onEvaluation?: (
      parameters: Record<FittedParameterName, number>,
      rmse: number,
    ) => void;
  } = {},
): FitResult {
  const maxEvaluations = options.maxEvaluations ?? 60;
  const toUnit = (value: number, name: FittedParameterName) =>
    (value - fitBounds[name][0]) / (fitBounds[name][1] - fitBounds[name][0]);
  const fromUnit = (unit: number[]) =>
    Object.fromEntries(
      names.map((name, index) => {
        const [low, high] = fitBounds[name];
        return [name, low + Math.min(1, Math.max(0, unit[index])) * (high - low)];
      }),
    ) as Record<FittedParameterName, number>;

  let evaluations = 0;
  const cost = (unit: number[]) => {
    const parameters = fromUnit(unit);
    const rmse = speedRmse(parameters, target, options);
    evaluations++;
    options.onEvaluation?.(parameters, rmse);
    return rmse;
  };

  const origin = names.map((name) => toUnit(start[name], name));
  let simplex = [
    origin,
    ...names.map((_, axis) =>
      origin.map((value, index) => (index === axis ? value + 0.15 : value)),
    ),
  ].map((point) => ({ point, value: cost(point) }));

  while (evaluations < maxEvaluations) {
    simplex.sort((a, b) => a.value - b.value);
    const best = simplex[0];
    const worst = simplex[simplex.length - 1];
    const secondWorst = simplex[simplex.length - 2];
    const centroid = names.map(
      (_, index) =>
        simplex.slice(0, -1).reduce((sum, vertex) => sum + vertex.point[index], 0) /
        (simplex.length - 1),
    );
    const along = (factor: number) =>
      centroid.map((value, index) => value + factor * (worst.point[index] - value));

    const reflected = along(-1);
    const reflectedValue = cost(reflected);
    if (reflectedValue < best.value) {
      const expanded = along(-2);
      const expandedValue = cost(expanded);
      simplex[simplex.length - 1] =
        expandedValue < reflectedValue
          ? { point: expanded, value: expandedValue }
          : { point: reflected, value: reflectedValue };
    } else if (reflectedValue < secondWorst.value) {
      simplex[simplex.length - 1] = { point: reflected, value: reflectedValue };
    } else {
      const contracted = along(0.5);
      const contractedValue = cost(contracted);
      if (contractedValue < worst.value) {
        simplex[simplex.length - 1] = { point: contracted, value: contractedValue };
      } else {
        simplex = simplex.map((vertex, index) =>
          index === 0
            ? vertex
            : (() => {
                const point = vertex.point.map(
                  (value, axis) => best.point[axis] + 0.5 * (value - best.point[axis]),
                );
                return { point, value: cost(point) };
              })(),
        );
      }
    }
  }

  simplex.sort((a, b) => a.value - b.value);
  return {
    evaluations,
    parameters: fromUnit(simplex[0].point),
    rmse: simplex[0].value,
  };
}
