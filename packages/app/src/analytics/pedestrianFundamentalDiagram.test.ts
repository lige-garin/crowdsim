import { describe, expect, it } from "vitest";
import {
  compareToWeidmann,
  maxAbsoluteWeidmannDeviation,
  weidmannFundamentalDiagram,
  weidmannSpeedAtDensity,
} from "./pedestrianFundamentalDiagram";

describe("Weidmann fundamental diagram", () => {
  it("carries the published parameters", () => {
    expect(weidmannFundamentalDiagram.freeFlowSpeedMetersPerSecond).toBe(1.34);
    expect(weidmannFundamentalDiagram.jamDensityPerSquareMeter).toBe(5.4);
    expect(weidmannFundamentalDiagram.shapeParameterPerSquareMeter).toBe(1.913);
    expect(weidmannFundamentalDiagram.freeFlowSpeedStdDevMetersPerSecond).toBe(0.26);
  });

  it("returns the free-flow speed when there is no density", () => {
    expect(weidmannSpeedAtDensity(0)).toBe(1.34);
    expect(weidmannSpeedAtDensity(-1)).toBe(1.34);
  });

  it("stops at and beyond the jam density", () => {
    expect(weidmannSpeedAtDensity(5.4)).toBe(0);
    expect(weidmannSpeedAtDensity(7)).toBe(0);
  });

  // Hand-computed from v = 1.34 * (1 - exp(-1.913 * (1/rho - 1/5.4))). These
  // pin the formula down: a typo in any of the three parameters moves them.
  it("matches hand-computed points on the published curve", () => {
    expect(weidmannSpeedAtDensity(0.5)).toBeCloseTo(1.298, 2);
    expect(weidmannSpeedAtDensity(1)).toBeCloseTo(1.058, 2);
    expect(weidmannSpeedAtDensity(1.5)).toBeCloseTo(0.806, 2);
    expect(weidmannSpeedAtDensity(2)).toBeCloseTo(0.606, 2);
    expect(weidmannSpeedAtDensity(3)).toBeCloseTo(0.331, 2);
    expect(weidmannSpeedAtDensity(4)).toBeCloseTo(0.157, 2);
    expect(weidmannSpeedAtDensity(5)).toBeCloseTo(0.037, 2);
  });

  it("decreases monotonically with density", () => {
    const speeds = [0.25, 0.5, 1, 1.5, 2, 3, 4, 5].map(weidmannSpeedAtDensity);

    for (let index = 1; index < speeds.length; index++) {
      expect(speeds[index]).toBeLessThan(speeds[index - 1]);
    }
  });

  it("reports how far a never-slowing model sits above the curve", () => {
    // The engine currently walks everyone at the free-flow speed regardless of
    // density. Recording that gap is the point of this module: it is a measured
    // distance from the literature, not a pass.
    const samples = [
      { densityPerSquareMeter: 0.5, speedMetersPerSecond: 1.34 },
      { densityPerSquareMeter: 2, speedMetersPerSecond: 1.34 },
      { densityPerSquareMeter: 4, speedMetersPerSecond: 1.34 },
    ];
    const deviations = compareToWeidmann(samples);

    expect(deviations.map((entry) => entry.deltaMetersPerSecond)).toEqual([
      expect.closeTo(0.042, 2),
      expect.closeTo(0.734, 2),
      expect.closeTo(1.183, 2),
    ]);
    // Every delta is positive: the model is uniformly too fast.
    expect(deviations.every((entry) => entry.deltaMetersPerSecond > 0)).toBe(true);
    expect(maxAbsoluteWeidmannDeviation(samples)).toBeCloseTo(1.183, 2);
  });

  it("treats matching the curve as zero deviation", () => {
    const onCurve = [0.5, 1, 2, 3].map((density) => ({
      densityPerSquareMeter: density,
      speedMetersPerSecond: weidmannSpeedAtDensity(density),
    }));

    expect(maxAbsoluteWeidmannDeviation(onCurve)).toBeCloseTo(0, 10);
  });
});
