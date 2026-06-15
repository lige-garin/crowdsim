import { describe, expect, it } from "vitest";
import { parseScene } from "@crowdsim/scene-schema";
import {
  createAiCommercialActionItems,
  createAiMallPlanDraft,
  createAiStoreParameterSuggestion,
  createAiZoneDrafts,
} from "./aiMallAutomation";

const scene = parseScene({
  schemaVersion: "1.0.0",
  id: "mall-ai",
  name: "Mall AI",
  world: { width: 90, height: 36 },
});

describe("AI mall automation", () => {
  it("drafts mall zones from prompt intent", () => {
    const draft = createAiMallPlanDraft(scene, "一楼需要珠宝区、化妆品区和餐饮");

    expect(draft.id).toBe("mall-ai-ai-mall-draft");
    expect(draft.zones.map((zone) => zone.category)).toEqual([
      "jewelry",
      "cosmetics",
      "dining",
    ]);
    expect(draft.zones[0].geometry.points).toHaveLength(4);
  });

  it("returns explainable zone drafts and store defaults", () => {
    const drafts = createAiZoneDrafts("cosmetics and jewelry floor");
    const jewelry = createAiStoreParameterSuggestion("jewelry");

    expect(drafts.map((draft) => draft.category)).toEqual(["jewelry", "cosmetics"]);
    expect(drafts[0].reason).toContain("jewelry");
    expect(jewelry.priceTier).toBe(5);
    expect(jewelry.dwellMeanSeconds).toBeGreaterThan(240);
  });

  it("turns commercial validation into experiment-ready action items", () => {
    const items = createAiCommercialActionItems({
      averageTopStoreProbability: 0.2,
      brandProfileCount: 2,
      environmentRiskScore: 0.5,
      generatedStoreLotCount: 0,
      notes: [],
      routeCostMax: 2,
      routeCostMin: 1,
      shopCount: 2,
      totalCapacity: 20,
      zoneCount: 1,
    });

    expect(items.map((item) => item.id)).toEqual([
      "reduce-environment-risk",
      "raise-brand-pull",
      "generate-store-lots",
    ]);
  });
});
