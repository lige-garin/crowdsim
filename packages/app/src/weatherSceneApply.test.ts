import { describe, expect, it } from "vitest";
import { defaultDemoScene } from "./defaultDemoScene";
import { applyWeatherFactorsToScene } from "./weatherSceneApply";
import type { WeatherEnvironmentFactorInput } from "./weatherMcpClient";

const rainFactor: WeatherEnvironmentFactorInput = {
  id: "weather-rain",
  kind: "rain",
  severity: 0.4,
};

describe("applyWeatherFactorsToScene", () => {
  it("adds the fetched factors to the scene", () => {
    const next = applyWeatherFactorsToScene(defaultDemoScene, [rainFactor]);
    expect(next.environmentFactors.map((factor) => factor.id)).toContain(
      "weather-rain",
    );
  });

  it("keeps factors from any other source untouched", () => {
    // defaultDemoScene already carries "high-street-rain", not under the
    // "weather-" prefix — a hand-placed factor, not one this module added.
    const next = applyWeatherFactorsToScene(defaultDemoScene, [rainFactor]);
    expect(next.environmentFactors.map((factor) => factor.id)).toContain(
      "high-street-rain",
    );
  });

  it("replaces a previous weather fetch's factors rather than accumulating them", () => {
    const first = applyWeatherFactorsToScene(defaultDemoScene, [rainFactor]);
    const second = applyWeatherFactorsToScene(first, [
      { id: "weather-fog", kind: "fog", severity: 0.6 },
    ]);
    const ids = second.environmentFactors.map((factor) => factor.id);
    expect(ids).toContain("weather-fog");
    expect(ids).not.toContain("weather-rain");
    expect(ids.filter((id) => id.startsWith("weather-"))).toHaveLength(1);
  });

  it("clears weather factors when the current fetch produces none (clear weather)", () => {
    const withRain = applyWeatherFactorsToScene(defaultDemoScene, [rainFactor]);
    const cleared = applyWeatherFactorsToScene(withRain, []);
    expect(cleared.environmentFactors.map((factor) => factor.id)).not.toContain(
      "weather-rain",
    );
    expect(cleared.environmentFactors.map((factor) => factor.id)).toContain(
      "high-street-rain",
    );
  });

  it("fills in defaults for input-shaped factor fields (severity, startsAtSeconds)", () => {
    const next = applyWeatherFactorsToScene(defaultDemoScene, [
      { id: "weather-wind", kind: "wind" },
    ]);
    const factor = next.environmentFactors.find(
      (entry) => entry.id === "weather-wind",
    )!;
    expect(factor.severity).toBe(0.5);
    expect(factor.startsAtSeconds).toBe(0);
  });

  it("respects a custom idPrefix", () => {
    const next = applyWeatherFactorsToScene(
      defaultDemoScene,
      [{ id: "custom-rain", kind: "rain", severity: 0.3 }],
      "custom",
    );
    const again = applyWeatherFactorsToScene(
      next,
      [{ id: "custom-fog", kind: "fog", severity: 0.3 }],
      "custom",
    );
    const ids = again.environmentFactors.map((factor) => factor.id);
    expect(ids).toContain("custom-fog");
    expect(ids).not.toContain("custom-rain");
  });
});
