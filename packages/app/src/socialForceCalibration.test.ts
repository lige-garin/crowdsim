import { describe, expect, it } from "vitest";
import { rimeaCoreScenarios } from "./benchmarkScenarios";
import { runBenchmarkScenario } from "./benchmarkRunner";
import type { NeuralCorrectionModel } from "./neuralCorrection";
import {
  calibrateSocialForceParameters,
  createResidualProjectionValidationReport,
} from "./socialForceCalibration";
import {
  demoTrajectoryCsv,
  deriveTrajectoryCalibrationTarget,
  parseTrajectoryDatasetCsv,
} from "./trajectoryDataset";

function createTarget() {
  return deriveTrajectoryCalibrationTarget(
    parseTrajectoryDatasetCsv(demoTrajectoryCsv, {
      id: "demo-bottleneck",
      name: "Demo bottleneck trajectory",
      source: "unified-csv-adapter",
    }),
  );
}

describe("social force calibration", () => {
  it("converts trajectory targets into bounded social-force parameters", () => {
    const result = runBenchmarkScenario(rimeaCoreScenarios[0]);
    const preset = calibrateSocialForceParameters(result, createTarget());

    expect(preset.desiredSpeedMetersPerSecond).toBeGreaterThan(0.6);
    expect(preset.desiredSpeedMetersPerSecond).toBeLessThan(2.2);
    expect(preset.interactionStrengthA).toBeGreaterThan(1.7);
    expect(preset.interactionRangeB).toBeGreaterThan(0.25);
    expect(preset.relaxationTimeSeconds).toBeGreaterThan(0.24);
    expect(preset.notes[0]).toContain("trajectory target");
  });

  it("reports pure physics versus physics plus residual projection error", () => {
    const result = runBenchmarkScenario(rimeaCoreScenarios[0]);
    const report = createResidualProjectionValidationReport(result, createTarget());

    expect(report.modelSource).toBe("fitted-projection");
    expect(report.improved).toBe(true);
    expect(report.targetThroughputPerMinute).toBe(60);
  });

  // The default multiplier is target/actual, so "corrected" can only ever look
  // better. This drives the residual the wrong way on a run that already sits
  // on target, which is the only way the report can say it made things worse.
  it("reports improved=false when the residual moves the run off target", () => {
    const onTarget = {
      ...runBenchmarkScenario(rimeaCoreScenarios[0]),
      meanSpeedMetersPerSecond: 0.99,
      throughputPerMinute: 60,
    };
    const target = {
      densityEstimatePerSquareMeter: 1,
      durationSeconds: 60,
      targetMeanSpeedMetersPerSecond: 1,
      targetThroughputPerMinute: 60,
      trackCount: 10,
    };
    const report = createResidualProjectionValidationReport(
      onTarget,
      target,
      overshootingModel,
    );

    expect(report.baselineMeanError).toBeLessThan(0.01);
    expect(report.correctedMeanError).toBeGreaterThan(report.baselineMeanError);
    expect(report.improved).toBe(false);
    expect(report.improvementRatio).toBeLessThan(0);
  });
});

const overshootingModel: NeuralCorrectionModel = {
  enabled: true,
  hiddenBias: [4, 4, 4],
  hiddenWeights: [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  outputBias: [4, 4],
  outputWeights: [
    [4, 4, 4],
    [4, 4, 4],
  ],
  source: "fitted-projection",
};
