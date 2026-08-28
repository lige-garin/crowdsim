import type { BenchmarkRunResult } from "./benchmarkTypes";
import {
  createDefaultNeuralCorrectionModel,
  createNeuralCorrectionRecommendation,
  type NeuralCorrectionModel,
} from "./neuralCorrection";
import {
  createResidualProjectionSamples,
  fitResidualProjection,
} from "./neuralResidualTraining";
import type { TrajectoryCalibrationTarget } from "./trajectoryDataset";

export type SocialForceParameterPreset = {
  confidence: number;
  desiredSpeedMetersPerSecond: number;
  interactionRangeB: number;
  interactionStrengthA: number;
  notes: readonly string[];
  relaxationTimeSeconds: number;
  speedMultiplier: number;
  throughputMultiplier: number;
};

// "Neural correction" was the fabricated 4-3-2 MLP distillation claim (see
// docs/CLAIMS_LEDGER.md); the surviving mechanism is a bounded residual applied
// on top of a target/actual multiplier, so the report is named after that.
export type ResidualProjectionValidationReport = {
  baselineMeanError: number;
  correctedMeanError: number;
  correctedMeanSpeedMetersPerSecond: number;
  correctedThroughputPerMinute: number;
  /** False when the residual pushed the run further from the target. */
  improved: boolean;
  improvementRatio: number;
  modelSource: NeuralCorrectionModel["source"];
  targetMeanSpeedMetersPerSecond: number;
  targetThroughputPerMinute: number;
};

export function calibrateSocialForceParameters(
  result: BenchmarkRunResult,
  target: TrajectoryCalibrationTarget,
  options: { baseDesiredSpeedMetersPerSecond?: number } = {},
): SocialForceParameterPreset {
  const baseDesiredSpeed = options.baseDesiredSpeedMetersPerSecond ?? 1.34;
  const speedMultiplier = boundedMultiplier(
    target.targetMeanSpeedMetersPerSecond,
    result.meanSpeedMetersPerSecond,
  );
  const throughputMultiplier = boundedMultiplier(
    target.targetThroughputPerMinute,
    result.throughputPerMinute,
  );
  const densityPressure = clamp(target.densityEstimatePerSquareMeter / 2, 0, 1);
  const speedError = relativeError(
    target.targetMeanSpeedMetersPerSecond,
    result.meanSpeedMetersPerSecond,
  );
  const throughputError = relativeError(
    target.targetThroughputPerMinute,
    result.throughputPerMinute,
  );

  return {
    confidence: round(clamp(1 - (speedError + throughputError) / 2, 0, 1)),
    desiredSpeedMetersPerSecond: round(
      clamp(baseDesiredSpeed * speedMultiplier, 0.6, 2.2),
    ),
    interactionRangeB: round(0.28 + densityPressure * 0.22),
    interactionStrengthA: round(1.8 + densityPressure * 2.4),
    notes: createCalibrationNotes(speedError, throughputError, densityPressure),
    relaxationTimeSeconds: round(clamp(0.5 / speedMultiplier, 0.25, 1.2)),
    speedMultiplier,
    throughputMultiplier,
  };
}

export function createResidualProjectionValidationReport(
  result: BenchmarkRunResult,
  target: TrajectoryCalibrationTarget,
  model = fitResidualProjection(
    createResidualProjectionSamples(result, {
      targetMeanSpeedMetersPerSecond: target.targetMeanSpeedMetersPerSecond,
      targetThroughputPerMinute: target.targetThroughputPerMinute,
    }),
    { seedModel: createDefaultNeuralCorrectionModel() },
  ).model,
): ResidualProjectionValidationReport {
  const recommendation = createNeuralCorrectionRecommendation(
    result,
    {
      targetMeanSpeedMetersPerSecond: target.targetMeanSpeedMetersPerSecond,
      targetThroughputPerMinute: target.targetThroughputPerMinute,
    },
    { model },
  );
  const correctedMeanSpeedMetersPerSecond = round(
    result.meanSpeedMetersPerSecond * recommendation.speedMultiplier,
  );
  const correctedThroughputPerMinute = round(
    result.throughputPerMinute * recommendation.throughputMultiplier,
  );
  const baselineMeanError = meanRelativeError(
    result.meanSpeedMetersPerSecond,
    result.throughputPerMinute,
    target,
  );
  const correctedMeanError = meanRelativeError(
    correctedMeanSpeedMetersPerSecond,
    correctedThroughputPerMinute,
    target,
  );

  return {
    baselineMeanError,
    correctedMeanError,
    correctedMeanSpeedMetersPerSecond,
    correctedThroughputPerMinute,
    improved: correctedMeanError < baselineMeanError,
    improvementRatio:
      baselineMeanError > 0
        ? round((baselineMeanError - correctedMeanError) / baselineMeanError)
        : 0,
    modelSource: model.source,
    targetMeanSpeedMetersPerSecond: target.targetMeanSpeedMetersPerSecond,
    targetThroughputPerMinute: target.targetThroughputPerMinute,
  };
}

function createCalibrationNotes(
  speedError: number,
  throughputError: number,
  densityPressure: number,
) {
  const notes = ["Unified trajectory target converted into social-force preset."];

  if (speedError > 0.15) {
    notes.push("Desired speed needs calibration against observed tracks.");
  }

  if (throughputError > 0.15) {
    notes.push("Throughput mismatch should be verified with batch experiments.");
  }

  if (densityPressure > 0.5) {
    notes.push("Dense fixture raises interaction strength and range.");
  }

  return notes;
}

function meanRelativeError(
  speed: number,
  throughput: number,
  target: TrajectoryCalibrationTarget,
) {
  return round(
    (relativeError(target.targetMeanSpeedMetersPerSecond, speed) +
      relativeError(target.targetThroughputPerMinute, throughput)) /
      2,
  );
}

function boundedMultiplier(target: number, actual: number) {
  if (target <= 0 || actual <= 0) {
    return 1;
  }

  return round(clamp(target / actual, 0.5, 1.5));
}

function relativeError(target: number, actual: number) {
  if (target <= 0) {
    return 0;
  }

  return Math.abs(target - actual) / target;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number) {
  return Number(value.toFixed(4));
}
