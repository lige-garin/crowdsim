import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { createAgentMindset } from "./agentPersona";
import { calibrateBrandAttraction } from "./brandCalibration";
import {
  chooseBrandStore,
  createBrandStoresFromScene,
  rankBrandStores,
} from "./brandAttraction";
import { createCustomerTwin, updateCustomerTwin } from "./customerDigitalTwin";

export type BrandDecisionInsight = {
  calibration: {
    meanAbsoluteErrorAfter: number;
    meanAbsoluteErrorBefore: number;
  };
  currentIntent: string;
  probabilityPercent: number;
  reasons: string[];
  score: number;
  selectedBrandName: string;
  selectedCategory: string;
  selectedStoreId: string;
  topStores: BrandDecisionStoreRank[];
  twin: {
    categoryAffinity: string;
    inferredPersona: string;
    observations: number;
  };
  persona: string;
};

export type BrandDecisionStoreRank = {
  category: string;
  id: string;
  name: string;
  probabilityPercent: number;
  score: number;
};

export function createBrandDecisionInsight(
  scene: CrowdSimScene,
): BrandDecisionInsight | undefined {
  const stores = createBrandStoresFromScene(scene);

  if (stores.length === 0) {
    return undefined;
  }

  const agent = createAgentMindset({ agentId: 9, seed: scene.seed });
  const context = {
    agentPosition: { x: 24, y: 22 },
    companionsInStore: ["table-signal"],
    crowdSensitivity: 0.42,
    mealTimeBoost: 0.18,
    randomUnit: 0.18,
  };
  const ranked = rankBrandStores(agent, stores, context);
  const selected = chooseBrandStore(agent, stores, context) ?? ranked[0];

  if (!selected) {
    return undefined;
  }

  const twin = updateCustomerTwin(
    updateCustomerTwin(createCustomerTwin(agent), {
      category: selected.store.brand.category,
      kind: "promotionSeen",
      storeId: selected.store.id,
    }),
    {
      category: selected.store.brand.category,
      kind: "enteredStore",
      storeId: selected.store.id,
    },
  );
  const calibration = calibrateBrandAttraction(
    stores,
    ranked.slice(0, 3).map((score, index) => ({
      observedEntryRate: Math.min(0.92, score.probability + 0.04 - index * 0.02),
      predictedEntryRate: score.probability,
      storeId: score.store.id,
    })),
  );

  return {
    calibration: {
      meanAbsoluteErrorAfter: round2(calibration.meanAbsoluteErrorAfter),
      meanAbsoluteErrorBefore: round2(calibration.meanAbsoluteErrorBefore),
    },
    currentIntent: agent.currentIntent,
    persona: agent.persona,
    probabilityPercent: Math.round(selected.probability * 100),
    reasons: selected.reasons,
    score: round2(selected.breakdown.total),
    selectedBrandName: selected.store.brand.name,
    selectedCategory: selected.store.brand.category,
    selectedStoreId: selected.store.id,
    topStores: ranked.slice(0, 4).map((score) => ({
      category: score.store.brand.category,
      id: score.store.id,
      name: score.store.brand.name,
      probabilityPercent: Math.round(score.probability * 100),
      score: round2(score.breakdown.total),
    })),
    twin: {
      categoryAffinity: formatTopAffinity(twin.categoryAffinity),
      inferredPersona: twin.inferredPersona,
      observations: twin.observations,
    },
  };
}

function formatTopAffinity(affinity: Record<string, number>) {
  return Object.entries(affinity)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([category, value]) => `${category}:${value.toFixed(2)}`)
    .join(" | ");
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
