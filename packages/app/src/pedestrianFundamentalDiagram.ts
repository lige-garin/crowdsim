/**
 * Published reference values for pedestrian speed-density behaviour.
 *
 * HONESTY NOTE (see docs/CLAIMS_LEDGER.md): these numbers are quoted from the
 * literature, NOT measured from this engine. Everything in this module is a
 * reference to compare against; none of it is evidence that this engine is
 * correct. Engine measurements belong in the benchmark results, and the
 * comparison between the two is the honest part.
 *
 * RiMEA test 4 asks whether a model reproduces the shape of the fundamental
 * diagram. The diagram RiMEA points at is Weidmann's, so that is what is
 * implemented here.
 */

/**
 * Weidmann (1993), a review of 25 investigations, as quoted in:
 *
 * - Jülich, "Validated force-based modeling of pedestrian dynamics", IAS
 *   Series 13, eq. 1.12.
 * - "Physics of Human Crowds", Annual Review of Condensed Matter Physics,
 *   fig. 2 caption (v0 = 1.34 m/s, rho_max = 5.4 m^-2, gamma = 1.913 m^-2).
 * - Nikolić, Bierlaire & Farooq, STRC 2014, eq. 13.
 *
 * The free-flow speed is reported as a Gaussian with mean 1.34 m/s and
 * standard deviation 0.26 m/s, so it is a population mean, not a constant that
 * any single person walks at.
 */
export const weidmannFundamentalDiagram = {
  freeFlowSpeedMetersPerSecond: 1.34,
  freeFlowSpeedStdDevMetersPerSecond: 0.26,
  jamDensityPerSquareMeter: 5.4,
  shapeParameterPerSquareMeter: 1.913,
} as const;

/**
 * The Kladek formula as fitted by Weidmann: free-flow speed scaled by an
 * exponential inhibition that goes to zero at the jam density.
 */
export function weidmannSpeedAtDensity(densityPerSquareMeter: number): number {
  const {
    freeFlowSpeedMetersPerSecond: freeFlowSpeed,
    jamDensityPerSquareMeter: jamDensity,
    shapeParameterPerSquareMeter: shapeParameter,
  } = weidmannFundamentalDiagram;

  if (!Number.isFinite(densityPerSquareMeter) || densityPerSquareMeter <= 0) {
    // No neighbours means nothing to slow anyone down: the free-flow limit.
    return freeFlowSpeed;
  }

  if (densityPerSquareMeter >= jamDensity) {
    return 0;
  }

  return (
    freeFlowSpeed *
    (1 - Math.exp(-shapeParameter * (1 / densityPerSquareMeter - 1 / jamDensity)))
  );
}

/**
 * The most people per second a metre of width lets through on Weidmann's curve:
 * the peak of specific flow J = ρ·v(ρ), found numerically (≈1.22 P/(m·s) near
 * 1.75 P/m²). Used as the capacity of a doorway or entrance.
 */
export const weidmannMaxSpecificFlow = (() => {
  let best = 0;
  for (
    let density = 0.01;
    density < weidmannFundamentalDiagram.jamDensityPerSquareMeter;
    density += 0.01
  ) {
    best = Math.max(best, density * weidmannSpeedAtDensity(density));
  }
  return best;
})();

export type SpeedDensitySample = {
  densityPerSquareMeter: number;
  speedMetersPerSecond: number;
};

export type FundamentalDiagramDeviation = {
  deltaMetersPerSecond: number;
  densityPerSquareMeter: number;
  expectedSpeedMetersPerSecond: number;
  observedSpeedMetersPerSecond: number;
};

/**
 * Differences between observed samples and the published curve. Positive delta
 * means the observation is faster than Weidmann predicts, which is the
 * direction a model that never slows anyone down will always be wrong in.
 */
export function compareToWeidmann(
  samples: readonly SpeedDensitySample[],
): FundamentalDiagramDeviation[] {
  return samples.map((sample) => {
    const expected = weidmannSpeedAtDensity(sample.densityPerSquareMeter);

    return {
      deltaMetersPerSecond: sample.speedMetersPerSecond - expected,
      densityPerSquareMeter: sample.densityPerSquareMeter,
      expectedSpeedMetersPerSecond: expected,
      observedSpeedMetersPerSecond: sample.speedMetersPerSecond,
    };
  });
}

export function maxAbsoluteWeidmannDeviation(
  samples: readonly SpeedDensitySample[],
): number {
  return compareToWeidmann(samples).reduce(
    (worst, entry) => Math.max(worst, Math.abs(entry.deltaMetersPerSecond)),
    0,
  );
}

/**
 * The SFPE hydraulic model for level corridors: S = k(1 − a·D) with
 * k = 1.40 m/s and a = 0.266 m², for densities D from 0.54 to 3.8 P/m². Below
 * 0.54 people walk at 0.85k (1.19 m/s, where the line meets); above 3.8 the
 * formula reaches zero and the flow stops.
 *
 * SOURCE NOTE: the constants are those of the hydraulic model in the SFPE
 * Handbook of Fire Protection Engineering (egress chapter, after Nelson and
 * Mowrer), as widely reproduced by egress tools. They are used here only as a
 * second, independent reference curve — nothing is fitted to them. Check them
 * against the handbook edition you cite before quoting results.
 */
export const sfpeCorridorModel = {
  k: 1.4,
  a: 0.266,
  minDensity: 0.54,
  maxDensity: 3.8,
} as const;

export function sfpeCorridorSpeedAtDensity(densityPerSquareMeter: number): number {
  const { a, k, maxDensity, minDensity } = sfpeCorridorModel;
  if (densityPerSquareMeter >= maxDensity) return 0;
  const density = Math.max(minDensity, densityPerSquareMeter);
  return Math.max(0, k * (1 - a * density));
}
