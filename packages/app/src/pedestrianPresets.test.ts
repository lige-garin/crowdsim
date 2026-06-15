import { describe, expect, it } from "vitest";
import {
  calculatePassengerShareTotal,
  createPedestrianPresetSummary,
  getPedestrianPreset,
  pedestrianPresets,
} from "./pedestrianPresets";

describe("pedestrian presets", () => {
  it("keeps IMO passenger population shares normalized", () => {
    expect(calculatePassengerShareTotal()).toBe(100);
  });

  it("keeps every preset sourced and physically ordered", () => {
    expect(pedestrianPresets).toHaveLength(12);

    for (const preset of pedestrianPresets) {
      expect(preset.source.label).toContain("IMO MSC.1/Circ.1533");
      expect(preset.source.url).toContain("MSC.1-CIRC.1533");
      expect(preset.flatTerrainSpeed.minMetersPerSecond).toBeLessThan(
        preset.flatTerrainSpeed.maxMetersPerSecond,
      );
      expect(preset.stairUpSpeed.maxMetersPerSecond).toBeLessThanOrEqual(
        preset.flatTerrainSpeed.maxMetersPerSecond,
      );
    }
  });

  it("creates compact summaries for calibration reports", () => {
    const preset = getPedestrianPreset("male-30-50");

    expect(preset).toBeDefined();
    expect(createPedestrianPresetSummary(preset!)).toMatchObject({
      flatTerrainMeanMetersPerSecond: 1.295,
      id: "male-30-50",
      stairDownMeanMetersPerSecond: 0.855,
      stairUpMeanMetersPerSecond: 0.63,
    });
  });
});
