import type { CrowdSimScene } from "@crowdsim/scene-schema";
import type { AgentIntent, AgentMindset, AgentPersona } from "./agentPersona";
import { clamp01, intentWeight } from "./agentPersona";

export type BrandCategory =
  | "anchor"
  | "coffee"
  | "cosmetics"
  | "dining"
  | "electronics"
  | "entertainment"
  | "family"
  | "fastFashion"
  | "grocery"
  | "jewelry"
  | "luxury"
  | "restaurant"
  | "service";

export type BrandProfile = {
  brandPower: number;
  capacity: number;
  category: BrandCategory;
  dwellMeanSeconds: number;
  id: string;
  name: string;
  novelty: number;
  personaAffinity: Partial<Record<AgentPersona, number>>;
  priceTier: number;
  promotion: number;
  queueToleranceImpact: number;
  visibility: number;
};

export type BrandStoreCandidate = {
  brand: BrandProfile;
  crowdLevel: number;
  id: string;
  position: { x: number; y: number };
  queueLength: number;
};

export type BrandDecisionContext = {
  agentPosition: { x: number; y: number };
  companionsInStore?: readonly string[];
  crowdSensitivity?: number;
  mealTimeBoost?: number;
};

export type BrandScoreBreakdown = {
  brandAffinity: number;
  crowdPenalty: number;
  distanceCost: number;
  needMatch: number;
  priceMismatch: number;
  queuePenalty: number;
  socialBonus: number;
  total: number;
  visibilityBoost: number;
};

export type BrandScore = {
  breakdown: BrandScoreBreakdown;
  probability: number;
  reasons: string[];
  store: BrandStoreCandidate;
};

const categoryIntentMap: Record<BrandCategory, AgentIntent[]> = {
  anchor: ["browseFashion", "meetCompanion"],
  coffee: ["buyCoffee"],
  cosmetics: ["browseFashion"],
  dining: ["eatMeal", "meetCompanion"],
  electronics: ["browseFashion"],
  entertainment: ["meetCompanion", "eatMeal"],
  family: ["meetCompanion", "eatMeal"],
  fastFashion: ["browseFashion"],
  grocery: ["goToExit", "buyCoffee"],
  jewelry: ["browseFashion"],
  luxury: ["browseFashion"],
  restaurant: ["eatMeal", "meetCompanion"],
  service: ["seekService"],
};

export function createBrandStoresFromScene(
  scene: CrowdSimScene,
): BrandStoreCandidate[] {
  return scene.shops
    .filter((shop) => Boolean(shop.brand))
    .map((shop, index) => {
      const brand = shop.brand!;

      return {
        brand: {
          brandPower: brand.brandPower,
          capacity: shop.capacity,
          category: brand.category,
          dwellMeanSeconds: shop.dwellMeanSeconds,
          id: brand.profileId,
          name: shop.name ?? brand.profileId,
          novelty: brand.novelty,
          personaAffinity: brand.personaAffinity,
          priceTier: brand.priceTier,
          promotion: brand.promotion,
          queueToleranceImpact: 0.35 + shop.capacity / 90,
          visibility: brand.visibility,
        },
        crowdLevel: clamp01(0.22 + index * 0.08),
        id: shop.id,
        position: shop.position,
        queueLength: Math.round((index + 1) * 2.2),
      };
    });
}

export function scoreBrandForAgent(
  agent: AgentMindset,
  store: BrandStoreCandidate,
  context: BrandDecisionContext,
): BrandScore {
  const distance = distanceBetween(context.agentPosition, store.position);
  const personaAffinity = store.brand.personaAffinity[agent.persona] ?? 0.2;
  const needMatch = calculateNeedMatch(agent, store.brand.category);
  const brandAffinity =
    store.brand.brandPower * 0.34 +
    personaAffinity * 0.28 +
    store.brand.novelty * agent.traits.curiosity * 0.12 +
    store.brand.promotion * 0.1;
  const visibilityBoost = store.brand.visibility * 0.14;
  const socialBonus =
    (context.companionsInStore?.includes(store.id) ? 0.22 : 0) * agent.traits.sociality;
  const distanceCost =
    Math.log1p(distance) * (0.035 + agent.traits.timePressure * 0.035);
  const queuePenalty =
    (store.queueLength / Math.max(1, store.brand.capacity)) *
    (0.5 - agent.traits.patience * 0.24) *
    store.brand.queueToleranceImpact;
  const crowdPenalty =
    store.crowdLevel *
    (context.crowdSensitivity ?? 0.45) *
    (0.7 + agent.traits.riskAvoidance * 0.4);
  const priceMismatch =
    Math.max(0, store.brand.priceTier / 5 - agent.traits.budget) * 0.62;
  const mealBoost =
    store.brand.category === "restaurant" ? (context.mealTimeBoost ?? 0) : 0;
  const total =
    brandAffinity +
    needMatch +
    visibilityBoost +
    socialBonus +
    mealBoost -
    distanceCost -
    queuePenalty -
    crowdPenalty -
    priceMismatch;

  const breakdown = {
    brandAffinity,
    crowdPenalty,
    distanceCost,
    needMatch: needMatch + mealBoost,
    priceMismatch,
    queuePenalty,
    socialBonus,
    total,
    visibilityBoost,
  };

  return {
    breakdown,
    probability: 0,
    reasons: explainBrandScore(breakdown),
    store,
  };
}

export function rankBrandStores(
  agent: AgentMindset,
  stores: readonly BrandStoreCandidate[],
  context: BrandDecisionContext,
): BrandScore[] {
  const scores = stores.map((store) => scoreBrandForAgent(agent, store, context));
  const probabilities = softmax(scores.map((score) => score.breakdown.total));

  return scores
    .map((score, index) => ({ ...score, probability: probabilities[index] }))
    .sort((left, right) => right.probability - left.probability);
}

export function chooseBrandStore(
  agent: AgentMindset,
  stores: readonly BrandStoreCandidate[],
  context: BrandDecisionContext & { randomUnit: number },
) {
  const ranked = rankBrandStores(agent, stores, context);
  let cursor = 0;

  for (const score of ranked) {
    cursor += score.probability;

    if (context.randomUnit <= cursor) {
      return score;
    }
  }

  return ranked.at(-1);
}

function calculateNeedMatch(agent: AgentMindset, category: BrandCategory) {
  return (
    Math.max(
      ...categoryIntentMap[category].map((intent) => intentWeight(agent, intent)),
      0,
    ) * 0.38
  );
}

function explainBrandScore(score: BrandScoreBreakdown) {
  return [
    ["brand affinity", score.brandAffinity],
    ["need match", score.needMatch],
    ["visibility", score.visibilityBoost],
    ["social pull", score.socialBonus],
    ["distance cost", -score.distanceCost],
    ["queue penalty", -score.queuePenalty],
    ["crowd penalty", -score.crowdPenalty],
    ["price mismatch", -score.priceMismatch],
  ]
    .filter(([, value]) => Math.abs(value as number) > 0.02)
    .sort((left, right) => Math.abs(right[1] as number) - Math.abs(left[1] as number))
    .slice(0, 4)
    .map(
      ([label, value]) =>
        `${label} ${(value as number) >= 0 ? "+" : ""}${(value as number).toFixed(2)}`,
    );
}

function softmax(values: readonly number[]) {
  const max = Math.max(...values);
  const exponentials = values.map((value) => Math.exp((value - max) * 2.4));
  const sum = exponentials.reduce((total, value) => total + value, 0);

  return exponentials.map((value) => value / sum);
}

function distanceBetween(
  left: { x: number; y: number },
  right: { x: number; y: number },
) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}
