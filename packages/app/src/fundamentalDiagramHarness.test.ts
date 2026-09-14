import { describe, expect, it } from "vitest";
import { measureCorridorSpeed } from "./fundamentalDiagramHarness";
import { weidmannSpeedAtDensity } from "./pedestrianFundamentalDiagram";

describe("the default movement model's speed–density relation", () => {
  it("slows with density and stays near Weidmann's curve (calibration guard)", () => {
    // A quick version of docs/calibration: one seed, shorter runs. If a model
    // change moves the crowd off the curve, rerun the calibration rather than
    // loosening this.
    const measured = [0.5, 1.5, 2.5].map((density) => ({
      density,
      speed: measureCorridorSpeed(density, {}, { measureSeconds: 5, warmupSeconds: 6 }),
    }));

    expect(measured[0].speed).toBeGreaterThan(measured[1].speed);
    expect(measured[1].speed).toBeGreaterThan(measured[2].speed);
    for (const { density, speed } of measured) {
      expect(Math.abs(speed - weidmannSpeedAtDensity(density))).toBeLessThan(0.15);
    }
  }, 30_000);
});
