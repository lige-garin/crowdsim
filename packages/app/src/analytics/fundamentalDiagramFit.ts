import { boundedNelderMead } from "../boundedNelderMead";
import type { SocialForceParameters } from "../engine/crowdMovement";
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

/** Bounded Nelder–Mead over the fundamental-diagram RMSE — `boundedNelderMead`'s own solver. */
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
  const result = boundedNelderMead(
    names,
    fitBounds,
    start,
    (parameters) => speedRmse(parameters, target, options),
    options,
  );
  return {
    evaluations: result.evaluations,
    parameters: result.parameters,
    rmse: result.value,
  };
}
