import { describe, expect, it } from "vitest";
import { rimeaCoreScenarios } from "./benchmarkScenarios";
import { runBenchmarkScenario } from "./benchmarkRunner";
import {
  createNeuralCorrectionRecommendation,
  inferNeuralResidualCorrection,
} from "./neuralCorrection";
import {
  createResidualProjectionSamples,
  fitResidualProjection,
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
    samples: createResidualProjectionSamples(result, {
      targetMeanSpeedMetersPerSecond: target.targetMeanSpeedMetersPerSecond,
      targetThroughputPerMinute: target.targetThroughputPerMinute,
    }),
    target,
  };
}

describe("residual projection fit", () => {
  it("fits algebraic residual samples into a bounded fixed-projection model", () => {
    const { samples } = createTrainingFixture();
    const report = fitResidualProjection(samples);
    const prediction = inferNeuralResidualCorrection(samples[0].features, report.model);

    expect(report.sampleCount).toBe(6);
    expect(report.iterations).toBe(160);
    expect(report.model.source).toBe("fitted-projection");
    expect(report.finalLoss).toBeLessThan(report.initialLoss);
    expect(Math.abs(prediction.speedResidual)).toBeLessThanOrEqual(0.12);
    expect(Math.abs(prediction.throughputResidual)).toBeLessThanOrEqual(0.12);
  });

  it("can drive the auditable recommendation path with the fitted model", () => {
    const { result, samples, target } = createTrainingFixture();
    const report = fitResidualProjection(samples);
    const recommendation = createNeuralCorrectionRecommendation(
      result,
      {
        targetMeanSpeedMetersPerSecond: target.targetMeanSpeedMetersPerSecond,
        targetThroughputPerMinute: target.targetThroughputPerMinute,
      },
      { model: report.model },
    );

    expect(recommendation.modelApplied).toBe(true);
    expect(recommendation.notes[0]).toContain("fitted-projection");
  });
});
