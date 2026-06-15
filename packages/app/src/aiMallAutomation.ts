import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import type { CommercialValidationBundle } from "./commercialValidation";

type ZoneCategory = CrowdSimScene["zones"][number]["category"];

export type AiMallZoneDraft = {
  category: ZoneCategory;
  confidence: number;
  id: string;
  reason: string;
};

export type AiStoreParameterSuggestion = {
  capacity: number;
  dwellMeanSeconds: number;
  priceTier: number;
  serviceMeanSeconds?: number;
  zoneCategory: ZoneCategory;
};

export type AiCommercialActionItem = {
  experimentVariant?: string;
  id: string;
  priority: "high" | "low" | "medium";
  rationale: string;
  title: string;
};

export function createAiMallPlanDraft(
  scene: CrowdSimScene,
  prompt: string,
): CrowdSimScene {
  const categories = inferZoneCategories(prompt);
  const zoneWidth = scene.world.width / Math.max(1, categories.length);

  return parseScene({
    ...scene,
    id: `${scene.id}-ai-mall-draft`,
    name: `${scene.name} AI Mall Draft`,
    zones: [
      ...scene.zones,
      ...categories.map((category, index) => ({
        id: `ai-zone-${category}-${index + 1}`,
        attraction: defaultAttraction(category),
        category,
        dwellMeanSeconds: createAiStoreParameterSuggestion(category).dwellMeanSeconds,
        geometry: {
          type: "polygon" as const,
          points: [
            { x: zoneWidth * index, y: 0 },
            { x: zoneWidth * (index + 1), y: 0 },
            { x: zoneWidth * (index + 1), y: scene.world.height },
            { x: zoneWidth * index, y: scene.world.height },
          ],
        },
        name: `${category} draft`,
        walkable: category !== "emergency",
      })),
    ],
  });
}

export function createAiZoneDrafts(prompt: string): AiMallZoneDraft[] {
  return inferZoneCategories(prompt).map((category, index) => ({
    category,
    confidence: category === "mixed" ? 0.55 : 0.78,
    id: `zone-draft-${index + 1}`,
    reason: `Prompt indicates ${category} demand.`,
  }));
}

export function createAiStoreParameterSuggestion(
  zoneCategory: ZoneCategory,
): AiStoreParameterSuggestion {
  if (zoneCategory === "jewelry") {
    return { capacity: 8, dwellMeanSeconds: 300, priceTier: 5, zoneCategory };
  }

  if (zoneCategory === "cosmetics") {
    return { capacity: 16, dwellMeanSeconds: 240, priceTier: 4, zoneCategory };
  }

  if (zoneCategory === "dining") {
    return {
      capacity: 36,
      dwellMeanSeconds: 540,
      priceTier: 3,
      serviceMeanSeconds: 45,
      zoneCategory,
    };
  }

  return { capacity: 14, dwellMeanSeconds: 180, priceTier: 3, zoneCategory };
}

export function createAiCommercialActionItems(
  bundle: CommercialValidationBundle,
): AiCommercialActionItem[] {
  const items: AiCommercialActionItem[] = [];

  if (bundle.environmentRiskScore > 0.4) {
    items.push({
      experimentVariant: "weather-mitigation",
      id: "reduce-environment-risk",
      priority: "high",
      rationale:
        "Environment risk is high enough to alter route choice and dwell behavior.",
      title: "Compare weather/hazard mitigation routing",
    });
  }

  if (bundle.averageTopStoreProbability < 0.35 && bundle.shopCount > 0) {
    items.push({
      experimentVariant: "visibility-promotion",
      id: "raise-brand-pull",
      priority: "medium",
      rationale: "Top-store choice probability is weak for the current agent cohort.",
      title: "Test stronger storefront visibility and promotions",
    });
  }

  if (bundle.generatedStoreLotCount === 0) {
    items.push({
      id: "generate-store-lots",
      priority: "high",
      rationale:
        "Commercial validation cannot score store behavior without generated lots.",
      title: "Generate store lots for commercial zones",
    });
  }

  return items.length > 0
    ? items
    : [
        {
          id: "keep-regression-watch",
          priority: "low",
          rationale:
            "Commercial validation has enough structure for baseline comparison.",
          title: "Keep current layout as a regression baseline",
        },
      ];
}

function inferZoneCategories(prompt: string): ZoneCategory[] {
  const normalized = prompt.toLowerCase();
  const categories: ZoneCategory[] = [];

  if (normalized.includes("jewelry") || prompt.includes("珠宝"))
    categories.push("jewelry");
  if (normalized.includes("cosmetic") || prompt.includes("化妆"))
    categories.push("cosmetics");
  if (
    normalized.includes("dining") ||
    normalized.includes("food") ||
    prompt.includes("餐饮")
  )
    categories.push("dining");
  if (normalized.includes("fashion") || prompt.includes("服装"))
    categories.push("fashion");
  if (normalized.includes("service") || prompt.includes("服务"))
    categories.push("service");

  return categories.length > 0 ? categories : ["mixed"];
}

function defaultAttraction(category: ZoneCategory) {
  return category === "jewelry" || category === "cosmetics"
    ? 0.78
    : category === "dining"
      ? 0.66
      : 0.5;
}
