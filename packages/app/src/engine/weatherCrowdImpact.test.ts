import { describe, expect, it } from "vitest";
import { weatherCrowdImpact } from "./weatherCrowdImpact";

describe("weatherCrowdImpact", () => {
  it("does not change dwell in clear weather", () => {
    expect(
      weatherCrowdImpact({ riskScore: 0, storeAttractionMultiplier: 1 })
        .dwellMultiplier,
    ).toBe(1);
  });

  it("lengthens dwell in bad weather (sheltering)", () => {
    const rain = weatherCrowdImpact({ riskScore: 0.5, storeAttractionMultiplier: 1 });
    expect(rain.dwellMultiplier).toBeGreaterThan(1);
  });

  it("dwells longer the worse the weather", () => {
    const light = weatherCrowdImpact({ riskScore: 0.3, storeAttractionMultiplier: 1 });
    const storm = weatherCrowdImpact({ riskScore: 0.8, storeAttractionMultiplier: 1 });
    expect(storm.dwellMultiplier).toBeGreaterThan(light.dwellMultiplier);
  });

  it("a weather-driven store-attraction boost also lengthens dwell", () => {
    const base = weatherCrowdImpact({ riskScore: 0.4, storeAttractionMultiplier: 1 });
    const boosted = weatherCrowdImpact({
      riskScore: 0.4,
      storeAttractionMultiplier: 1.3,
    });
    expect(boosted.dwellMultiplier).toBeGreaterThan(base.dwellMultiplier);
  });

  it("clamps an out-of-range risk score", () => {
    expect(
      weatherCrowdImpact({ riskScore: 5, storeAttractionMultiplier: 1 })
        .dwellMultiplier,
    ).toBeLessThanOrEqual(2);
  });
});
