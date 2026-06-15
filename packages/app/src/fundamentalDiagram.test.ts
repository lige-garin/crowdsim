import { describe, expect, it } from "vitest";
import {
  calculateWeidmannSpeed,
  createFundamentalDiagramPoints,
} from "./fundamentalDiagram";

describe("fundamental diagram helpers", () => {
  it("keeps the Weidmann reference curve bounded and decreasing with density", () => {
    const freeFlow = calculateWeidmannSpeed(0);
    const lowDensity = calculateWeidmannSpeed(0.5);
    const highDensity = calculateWeidmannSpeed(4);
    const jammed = calculateWeidmannSpeed(5.4);

    expect(freeFlow).toBeCloseTo(1.34);
    expect(lowDensity).toBeLessThanOrEqual(freeFlow);
    expect(highDensity).toBeLessThan(lowDensity);
    expect(jammed).toBe(0);
  });

  it("creates comparison points against the reference curve", () => {
    const points = createFundamentalDiagramPoints([
      {
        densityPeoplePerSquareMeter: 1,
        observedSpeedMetersPerSecond: 1.1,
      },
    ]);

    expect(points[0].densityPeoplePerSquareMeter).toBe(1);
    expect(points[0].referenceSpeedMetersPerSecond).toBeGreaterThan(0);
    expect(points[0].speedDeltaMetersPerSecond).toBeCloseTo(
      points[0].observedSpeedMetersPerSecond - points[0].referenceSpeedMetersPerSecond,
    );
  });
});
