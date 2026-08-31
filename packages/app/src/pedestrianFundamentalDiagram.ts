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
