import { describe, expect, it } from "vitest";
import { rimeaCoreScenarios } from "./benchmarkScenarios";
import { runBenchmarkScenario } from "./benchmarkRunner";
import {
  calibrateSocialForceParameters,
  createNeuralCorrectionValidationReport,
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

  it("reports pure physics versus physics plus neural correction error", () => {
    const result = runBenchmarkScenario(rimeaCoreScenarios[0]);
    const report = createNeuralCorrectionValidationReport(result, createTarget());

    expect(report.modelSource).toBe("trained-dataset");
    expect(report.baselineMeanError).toBeGreaterThan(report.correctedMeanError);
    expect(report.improvementRatio).toBeGreaterThan(0);
    expect(report.targetThroughputPerMinute).toBe(60);
  });
});
