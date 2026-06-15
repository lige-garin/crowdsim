import { describe, expect, it } from "vitest";
import { rimeaCoreScenarios } from "./benchmarkScenarios";
import { runBenchmarkScenario } from "./benchmarkRunner";
import {
  createNeuralCorrectionRecommendation,
  inferNeuralResidualCorrection,
} from "./neuralCorrection";
import {
  createResidualTrainingSamples,
  trainNeuralResidualModel,
} from "./neuralResidualTraining";
import {
  demoTrajectoryCsv,
  deriveTrajectoryCalibrationTarget,
  parseTrajectoryDatasetCsv,
} from "./trajectoryDataset";

function createTrainingFixture() {
  const result = runBenchmarkScenario(rimeaCoreScenarios[0]);
  const dataset = parseTrajectoryDatasetCsv(demoTrajectoryCsv, {
    id: "training-demo",
    name: "Training demo",
    source: "unified-csv-adapter",
  });
  const target = deriveTrajectoryCalibrationTarget(dataset);

  return {
    result,
    samples: createResidualTrainingSamples(result, {
      targetMeanSpeedMetersPerSecond: target.targetMeanSpeedMetersPerSecond,
      targetThroughputPerMinute: target.targetThroughputPerMinute,
    }),
    target,
  };
}

describe("neural residual training", () => {
  it("distills trajectory calibration samples into a bounded trained model", () => {
    const { samples } = createTrainingFixture();
    const report = trainNeuralResidualModel(samples);
    const prediction = inferNeuralResidualCorrection(samples[0].features, report.model);

    expect(report.sampleCount).toBe(6);
    expect(report.epochs).toBe(160);
    expect(report.model.source).toBe("trained-dataset");
    expect(report.finalLoss).toBeLessThan(report.initialLoss);
    expect(Math.abs(prediction.speedResidual)).toBeLessThanOrEqual(0.12);
    expect(Math.abs(prediction.throughputResidual)).toBeLessThanOrEqual(0.12);
  });

  it("can drive the auditable recommendation path with the trained model", () => {
    const { result, samples, target } = createTrainingFixture();
    const report = trainNeuralResidualModel(samples);
    const recommendation = createNeuralCorrectionRecommendation(
      result,
      {
        targetMeanSpeedMetersPerSecond: target.targetMeanSpeedMetersPerSecond,
        targetThroughputPerMinute: target.targetThroughputPerMinute,
      },
      { model: report.model },
    );

    expect(recommendation.modelApplied).toBe(true);
    expect(recommendation.notes[0]).toContain("trained-dataset");
  });
});
