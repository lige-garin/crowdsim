import type { EnvironmentImpact } from "./environmentEffects";

export type WeatherCrowdImpact = {
  /** Shoppers shelter longer in bad weather: dwell-time multiplier (>= 1). */
  dwellMultiplier: number;
};

/**
 * How the weather changes shopping behaviour. In bad weather (high riskScore)
 * shoppers linger in shops to shelter, and a weather-driven pull toward shops
 * (storeAttractionMultiplier > 1) lengthens dwell further. Clear weather leaves
 * dwell unchanged.
 */
export function weatherCrowdImpact(
  impact: Pick<EnvironmentImpact, "riskScore" | "storeAttractionMultiplier">,
): WeatherCrowdImpact {
  const risk = Math.max(0, Math.min(1, impact.riskScore));
  const attractionBoost = Math.max(0, impact.storeAttractionMultiplier - 1);
  return { dwellMultiplier: 1 + risk * 0.7 + attractionBoost * 0.5 };
}
