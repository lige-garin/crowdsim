import { describe, expect, it } from "vitest";
import { parseScene } from "@crowdsim/scene-schema";
import { rimeaCoreScenarios } from "./benchmarkScenarios";
import {
  calculateEnvironmentImpact,
  createEnvironmentComparisonExperiment,
  environmentScenarioPresets,
} from "./environmentEffects";

const scene = parseScene({
  schemaVersion: "1.0.0",
  id: "environment-demo",
  name: "Environment Demo",
  world: { width: 50, height: 30 },
  entrances: [
    { id: "entry", kind: "source", position: { x: 2, y: 15 }, width: 3 },
    { id: "exit", kind: "sink", position: { x: 48, y: 15 }, width: 3 },
  ],
  environmentFactors: [
    {
      id: "smoke-a",
      kind: "smoke",
      startsAtSeconds: 30,
      endsAtSeconds: 120,
      severity: 0.7,
    },
    {
      id: "promo-a",
      kind: "promotionSurge",
      startsAtSeconds: 0,
      severity: 0.5,
    },
  ],
});

describe("environment effects", () => {
  it("combines active weather and operational factors into behavior impacts", () => {
    const early = calculateEnvironmentImpact(scene, 10);
    const smoke = calculateEnvironmentImpact(scene, 60);

    expect(early.activeFactorIds).toEqual(["promo-a"]);
    expect(early.storeAttractionMultiplier).toBeGreaterThan(1);
    expect(smoke.activeFactorIds).toEqual(["smoke-a", "promo-a"]);
    expect(smoke.speedMultiplier).toBeLessThan(1);
    expect(smoke.visibilityMultiplier).toBeLessThan(0.5);
    expect(smoke.riskScore).toBeGreaterThan(0.5);
  });

  it("creates standard environment scenario presets", () => {
    const presets = environmentScenarioPresets(scene);

    expect(presets.map((preset) => preset.id)).toEqual([
      "rain",
      "fog",
      "smoke",
      "exitClosed",
      "promotionSurge",
    ]);
    expect(presets[2].scene.environmentFactors.at(-1)?.kind).toBe("smoke");
  });

  it("creates an experiment definition for clear/weather/hazard comparison", () => {
    const experiment = createEnvironmentComparisonExperiment(rimeaCoreScenarios[0]);

    expect(experiment.variants.map((variant) => variant.id)).toContain("smoke");
    expect(experiment.variants[0].id).toBe("clear");
    expect(experiment.replications).toBe(2);
  });
});
