import type { BenchmarkRunResult } from "./benchmarkTypes";

export type NeuralCorrectionInput = {
  targetMeanSpeedMetersPerSecond: number;
  targetThroughputPerMinute: number;
};

export type NeuralCorrectionRecommendation = {
  confidence: number;
  modelApplied: boolean;
  notes: string[];
  scenarioId: string;
  speedMultiplier: number;
  throughputMultiplier: number;
};

export type NeuralCorrectionFeatures = {
  densityPeak: number;
  remainingRatio: number;
  signedSpeedError: number;
  signedThroughputError: number;
};

export type NeuralCorrectionModel = {
  enabled: boolean;
  hiddenBias: readonly number[];
  hiddenWeights: readonly (readonly number[])[];
  outputBias: readonly number[];
  outputWeights: readonly (readonly number[])[];
  source: "calibration-fixture" | "fitted-projection" | "untrained";
};

export type NeuralResidualOutput = {
  modelSource: NeuralCorrectionModel["source"];
  speedResidual: number;
  throughputResidual: number;
};

export function createNeuralCorrectionRecommendation(
  result: BenchmarkRunResult,
  target: NeuralCorrectionInput,
  options: { model?: NeuralCorrectionModel } = {},
): NeuralCorrectionRecommendation {
  const baseSpeedMultiplier = boundedMultiplier(
    target.targetMeanSpeedMetersPerSecond,
    result.meanSpeedMetersPerSecond,
  );
  const baseThroughputMultiplier = boundedMultiplier(
    target.targetThroughputPerMinute,
    result.throughputPerMinute,
  );
  const speedError = relativeError(
    target.targetMeanSpeedMetersPerSecond,
    result.meanSpeedMetersPerSecond,
  );
  const throughputError = relativeError(
    target.targetThroughputPerMinute,
    result.throughputPerMinute,
  );
  const confidence = Math.max(0, Math.min(1, 1 - (speedError + throughputError) / 2));
  const features = createNeuralCorrectionFeatures(result, target);
  const residual = options.model?.enabled
    ? inferNeuralResidualCorrection(features, options.model)
    : undefined;
  const speedMultiplier = residual
    ? clampMultiplier(baseSpeedMultiplier * (1 + residual.speedResidual))
    : baseSpeedMultiplier;
  const throughputMultiplier = residual
    ? clampMultiplier(baseThroughputMultiplier * (1 + residual.throughputResidual))
    : baseThroughputMultiplier;

  return {
    confidence: round(confidence),
    modelApplied: Boolean(residual),
    notes: createCorrectionNotes(speedError, throughputError, residual),
    scenarioId: result.scenarioId,
    speedMultiplier,
    throughputMultiplier,
  };
}

export function applyNeuralCorrectionToSpeed(
  baseSpeedMetersPerSecond: number,
  recommendation: NeuralCorrectionRecommendation,
) {
  return round(baseSpeedMetersPerSecond * recommendation.speedMultiplier);
}

export function createDefaultNeuralCorrectionModel(): NeuralCorrectionModel {
  return {
    enabled: true,
    hiddenBias: [0.02, -0.01, 0.04],
    hiddenWeights: [
      [0.35, -0.18, 0.12, 0.08],
      [-0.16, 0.28, 0.06, -0.04],
      [0.1, 0.12, -0.2, 0.18],
    ],
    outputBias: [0, 0],
    outputWeights: [
      [0.08, -0.04, 0.03],
      [-0.02, 0.07, 0.04],
    ],
    source: "calibration-fixture",
  };
}

export function createNeuralCorrectionFeatures(
  result: BenchmarkRunResult,
  target: NeuralCorrectionInput,
): NeuralCorrectionFeatures {
  return {
    densityPeak: clamp01(result.densityPeak / 6),
    remainingRatio:
      result.spawnedCount > 0
        ? clamp01(result.remainingAgents / result.spawnedCount)
        : 0,
    signedSpeedError: signedRelativeError(
      target.targetMeanSpeedMetersPerSecond,
      result.meanSpeedMetersPerSecond,
    ),
    signedThroughputError: signedRelativeError(
      target.targetThroughputPerMinute,
      result.throughputPerMinute,
    ),
  };
}

export function inferNeuralResidualCorrection(
  features: NeuralCorrectionFeatures,
  model: NeuralCorrectionModel,
): NeuralResidualOutput {
  const input = [
    features.signedSpeedError,
    features.signedThroughputError,
    features.densityPeak,
    features.remainingRatio,
  ];
  const hidden = model.hiddenWeights.map((weights, index) =>
    Math.tanh(dot(weights, input) + (model.hiddenBias[index] ?? 0)),
  );
  const outputs = model.outputWeights.map((weights, index) =>
    Math.tanh(dot(weights, hidden) + (model.outputBias[index] ?? 0)),
  );

  return {
    modelSource: model.source,
    speedResidual: round(clamp(outputs[0] ?? 0, -0.12, 0.12)),
    throughputResidual: round(clamp(outputs[1] ?? 0, -0.12, 0.12)),
  };
}

function boundedMultiplier(target: number, actual: number) {
  if (target <= 0 || actual <= 0) {
    return 1;
  }

  return clampMultiplier(target / actual);
}

function clampMultiplier(value: number) {
  return round(Math.max(0.5, Math.min(1.5, value)));
}

function relativeError(target: number, actual: number) {
  if (target <= 0) {
    return 0;
  }

  return Math.abs(target - actual) / target;
}

function signedRelativeError(target: number, actual: number) {
  if (target <= 0) {
    return 0;
  }

  return clamp((target - actual) / target, -1, 1);
}

function createCorrectionNotes(
  speedError: number,
  throughputError: number,
  residual: NeuralResidualOutput | undefined,
) {
  const notes = residual
    ? [
        `Heuristic residual correction applied from ${residual.modelSource}; experimental, default off.`,
      ]
    : [
        "Heuristic residual inference path available; experimental, default off until calibrated.",
      ];

  if (speedError > 0.2) {
    notes.push("Speed calibration error exceeds 20%.");
  }

  if (throughputError > 0.2) {
    notes.push("Throughput calibration error exceeds 20%.");
  }

  return notes;
}

function dot(left: readonly number[], right: readonly number[]) {
  return left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number) {
  return Number(value.toFixed(4));
}
