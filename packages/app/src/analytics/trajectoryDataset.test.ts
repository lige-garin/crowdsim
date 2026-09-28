import { describe, expect, it } from "vitest";
import {
  demoTrajectoryCsv,
  deriveTrajectoryCalibrationTarget,
  parseTrajectoryDatasetCsv,
} from "./trajectoryDataset";

describe("trajectory dataset adapter", () => {
  it("parses pedestrian tracks from unified CSV rows", () => {
    const dataset = parseTrajectoryDatasetCsv(demoTrajectoryCsv, {
      id: "demo-bottleneck",
      name: "Demo bottleneck trajectory",
      source: "unified-csv-adapter",
    });

    expect(dataset.id).toBe("demo-bottleneck");
    expect(dataset.tracks).toHaveLength(3);
    expect(dataset.sampleCount).toBe(12);
    expect(dataset.tracks[0].samples.map((sample) => sample.timeSeconds)).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it("derives calibration targets from observed movement", () => {
    const dataset = parseTrajectoryDatasetCsv(demoTrajectoryCsv, {
      id: "demo-bottleneck",
      name: "Demo bottleneck trajectory",
      source: "unified-csv-adapter",
    });
    const target = deriveTrajectoryCalibrationTarget(dataset);

    expect(target.trackCount).toBe(3);
    expect(target.durationSeconds).toBe(3);
    expect(target.targetMeanSpeedMetersPerSecond).toBeGreaterThan(0.9);
    expect(target.targetMeanSpeedMetersPerSecond).toBeLessThan(1.3);
    expect(target.targetThroughputPerMinute).toBe(60);
    expect(target.densityEstimatePerSquareMeter).toBeGreaterThan(0);
  });

  it("rejects invalid rows with precise errors", () => {
    expect(() =>
      parseTrajectoryDatasetCsv("pedestrian_id,time_s,x_m,y_m\np1,abc,0,0", {
        id: "bad",
        name: "Bad",
        source: "test",
      }),
    ).toThrow("row 2");
  });
});
