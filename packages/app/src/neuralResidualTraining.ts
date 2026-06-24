// HONESTY NOTE (see docs/CLAIMS_LEDGER.md): this is NOT MLP distillation and NOT a
// model trained from trajectory ground truth. The fit targets are algebraic
// functions of the input features and only the output projection is fit by gradient
// descent over a fixed hidden layer -- a small fixed-projection residual. It is
// experimental and default-off. A genuine trajectory-trained model is deferred to
// SP-5. P0 T2 renamed the "train/trained-dataset/MLP" API to honest projection-fit
// terms; do not reintroduce "distillation" or "trained from ground truth" copy.
import {
  createDefaultNeuralCorrectionModel,
  createNeuralCorrectionFeatures,
  inferNeuralResidualCorrection,
  type NeuralCorrectionFeatures,
  type NeuralCorrectionInput,
  type NeuralCorrectionModel,
} from "./neuralCorrection";
import type { BenchmarkRunResult } from "./benchmarkTypes";

export type ResidualProjectionSample = {
  features: NeuralCorrectionFeatures;
  targetSpeedResidual: number;
  targetThroughputResidual: number;
};

export type ResidualProjectionFitReport = {
  iterations: number;
  finalLoss: number;
  initialLoss: number;
  model: NeuralCorrectionModel;
  sampleCount: number;
};

export function createResidualProjectionSamples(
  result: BenchmarkRunResult,
  target: NeuralCorrectionInput,
): ResidualProjectionSample[] {
  const base = createNeuralCorrectionFeatures(result, target);
  const variants: NeuralCorrectionFeatures[] = [
    base,
    {
      ...base,
      densityPeak: clamp01(base.densityPeak * 0.75),
      signedSpeedError: clamp(base.signedSpeedError * 0.8, -1, 1),
    },
    {
      ...base,
      densityPeak: clamp01(base.densityPeak * 1.2),
      signedThroughputError: clamp(base.signedThroughputError * 0.9, -1, 1),
    },
    {
      ...base,
      remainingRatio: clamp01(base.remainingRatio + 0.12),
      signedSpeedError: clamp(base.signedSpeedError - 0.08, -1, 1),
    },
    {
      ...base,
      remainingRatio: clamp01(base.remainingRatio * 0.5),
      signedThroughputError: clamp(base.signedThroughputError + 0.08, -1, 1),
    },
    {
      ...base,
      densityPeak: clamp01((base.densityPeak + 0.5) / 2),
      signedSpeedError: clamp(base.signedSpeedError * -0.35, -1, 1),
      signedThroughputError: clamp(base.signedThroughputError * -0.35, -1, 1),
    },
  ];

  return variants.map((features) => ({
    features,
    targetSpeedResidual: targetResidual(
      features.signedSpeedError * 0.07 -
        features.densityPeak * 0.015 +
        features.remainingRatio * 0.02,
    ),
    targetThroughputResidual: targetResidual(
      features.signedThroughputError * 0.065 + features.densityPeak * 0.012,
    ),
  }));
}

export function fitResidualProjection(
  samples: readonly ResidualProjectionSample[],
  options: {
    iterations?: number;
    learningRate?: number;
    seedModel?: NeuralCorrectionModel;
  } = {},
): ResidualProjectionFitReport {
  if (samples.length === 0) {
    throw new Error("Residual projection fit requires at least one sample");
  }

  const seedModel = options.seedModel ?? createDefaultNeuralCorrectionModel();
  const model = cloneModel(seedModel, false);
  const iterations = options.iterations ?? 160;
  const learningRate = options.learningRate ?? 0.08;
  const initialLoss = calculateResidualLoss(samples, model);
  const outputWeights = model.outputWeights.map((weights) => [...weights]);
  const outputBias = [...model.outputBias];

  for (let iteration = 0; iteration < iterations; iteration++) {
    for (const sample of samples) {
      const hidden = hiddenActivations(model, sample.features);
      const targets = [sample.targetSpeedResidual, sample.targetThroughputResidual];

      for (let output = 0; output < 2; output++) {
        const prediction = Math.tanh(
          dot(outputWeights[output], hidden) + (outputBias[output] ?? 0),
        );
        const gradient = 2 * (prediction - targets[output]) * (1 - prediction ** 2);

        for (let index = 0; index < hidden.length; index++) {
          outputWeights[output][index] -= learningRate * gradient * hidden[index];
        }

        outputBias[output] -= learningRate * gradient;
      }
    }
  }

  const fittedModel: NeuralCorrectionModel = {
    ...model,
    enabled: true,
    outputBias: outputBias.map(round),
    outputWeights: outputWeights.map((weights) => weights.map(round)),
    source: "fitted-projection",
  };

  return {
    iterations,
    finalLoss: calculateResidualLoss(samples, fittedModel),
    initialLoss,
    model: fittedModel,
    sampleCount: samples.length,
  };
}

export function calculateResidualLoss(
  samples: readonly ResidualProjectionSample[],
  model: NeuralCorrectionModel,
) {
  const total = samples.reduce((sum, sample) => {
    const prediction = inferNeuralResidualCorrection(sample.features, model);
    const speedError = prediction.speedResidual - sample.targetSpeedResidual;
    const throughputError =
      prediction.throughputResidual - sample.targetThroughputResidual;

    return sum + speedError ** 2 + throughputError ** 2;
  }, 0);

  return roundLoss(total / Math.max(1, samples.length * 2));
}

function cloneModel(
  model: NeuralCorrectionModel,
  enabled: boolean,
): NeuralCorrectionModel {
  return {
    enabled,
    hiddenBias: [...model.hiddenBias],
    hiddenWeights: model.hiddenWeights.map((weights) => [...weights]),
    outputBias: [...model.outputBias],
    outputWeights: model.outputWeights.map((weights) => [...weights]),
    source: "untrained",
  };
}

function hiddenActivations(
  model: NeuralCorrectionModel,
  features: NeuralCorrectionFeatures,
) {
  const input = [
    features.signedSpeedError,
    features.signedThroughputError,
    features.densityPeak,
    features.remainingRatio,
  ];

  return model.hiddenWeights.map((weights, index) =>
    Math.tanh(dot(weights, input) + (model.hiddenBias[index] ?? 0)),
  );
}

function dot(left: readonly number[], right: readonly number[]) {
  return left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
}

function targetResidual(value: number) {
  return round(clamp(value, -0.12, 0.12));
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

function roundLoss(value: number) {
  return Number(value.toFixed(8));
}
