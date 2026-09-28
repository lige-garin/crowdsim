import type { AgentMindset, AgentPersona, AgentTraitProfile } from "./agentPersona";
import { clamp01 } from "./agentPersona";
import type { BrandCategory, BrandStoreCandidate } from "./brandAttraction";

export type CustomerTwinEvent =
  | {
      category: BrandCategory;
      kind: "enteredStore";
      storeId: string;
    }
  | {
      category: BrandCategory;
      kind: "promotionSeen";
      storeId: string;
    }
  | {
      kind: "rejectedPrice";
      priceTier: number;
      storeId: string;
    }
  | {
      kind: "avoidedCrowd";
      crowdLevel: number;
      storeId: string;
    };

export type CustomerDigitalTwin = {
  agentId: number;
  categoryAffinity: Record<BrandCategory, number>;
  inferredPersona: AgentPersona;
  observations: number;
  persona: AgentPersona;
  traits: AgentTraitProfile;
};

const categories: BrandCategory[] = [
  "coffee",
  "family",
  "fastFashion",
  "luxury",
  "restaurant",
  "service",
];

export function createCustomerTwin(mindset: AgentMindset): CustomerDigitalTwin {
  const categoryAffinity = Object.fromEntries(
    categories.map((category) => [category, 0.35]),
  ) as Record<BrandCategory, number>;

  if (mindset.persona === "luxuryBuyer") {
    categoryAffinity.luxury = 0.75;
  }

  if (mindset.persona === "commuter") {
    categoryAffinity.coffee = 0.68;
  }

  if (mindset.persona === "family") {
    categoryAffinity.family = 0.72;
    categoryAffinity.restaurant = 0.62;
  }

  if (mindset.persona === "serviceSeeker") {
    categoryAffinity.service = 0.76;
  }

  return {
    agentId: mindset.id,
    categoryAffinity,
    inferredPersona: mindset.persona,
    observations: 0,
    persona: mindset.persona,
    traits: { ...mindset.traits },
  };
}

export function updateCustomerTwin(
  twin: CustomerDigitalTwin,
  event: CustomerTwinEvent,
): CustomerDigitalTwin {
  const next: CustomerDigitalTwin = {
    ...twin,
    categoryAffinity: { ...twin.categoryAffinity },
    observations: twin.observations + 1,
    traits: { ...twin.traits },
  };

  if (event.kind === "enteredStore") {
    next.categoryAffinity[event.category] = clamp01(
      next.categoryAffinity[event.category] + 0.12,
    );
    next.traits.brandLoyalty = clamp01(next.traits.brandLoyalty + 0.04);
  }

  if (event.kind === "promotionSeen") {
    next.categoryAffinity[event.category] = clamp01(
      next.categoryAffinity[event.category] + 0.07,
    );
    next.traits.curiosity = clamp01(next.traits.curiosity + 0.03);
  }

  if (event.kind === "rejectedPrice") {
    next.traits.budget = clamp01(next.traits.budget - event.priceTier * 0.035);
    next.traits.riskAvoidance = clamp01(next.traits.riskAvoidance + 0.03);
  }

  if (event.kind === "avoidedCrowd") {
    next.traits.riskAvoidance = clamp01(
      next.traits.riskAvoidance + event.crowdLevel * 0.08,
    );
    next.traits.patience = clamp01(next.traits.patience - event.crowdLevel * 0.04);
  }

  return {
    ...next,
    inferredPersona: inferPersonaFromTwin(next),
  };
}

export function inferPersonaFromTwin(twin: CustomerDigitalTwin): AgentPersona {
  if (twin.categoryAffinity.luxury > 0.7 && twin.traits.budget > 0.68) {
    return "luxuryBuyer";
  }

  if (twin.categoryAffinity.service > 0.68) {
    return "serviceSeeker";
  }

  if (twin.categoryAffinity.family > 0.68 || twin.traits.sociality > 0.78) {
    return "family";
  }

  if (twin.categoryAffinity.coffee > 0.62 && twin.traits.timePressure > 0.62) {
    return "commuter";
  }

  if (twin.traits.brandLoyalty > 0.65) {
    return "goalBuyer";
  }

  return "browser";
}

export function applyPromotionScenario(
  stores: readonly BrandStoreCandidate[],
  options: {
    category?: BrandCategory;
    lift: number;
    storeId?: string;
  },
): BrandStoreCandidate[] {
  return stores.map((store) => {
    const categoryMatch =
      !options.category || store.brand.category === options.category;
    const storeMatch = !options.storeId || store.id === options.storeId;

    if (!categoryMatch || !storeMatch) {
      return store;
    }

    return {
      ...store,
      brand: {
        ...store.brand,
        promotion: clamp01(store.brand.promotion + options.lift),
      },
    };
  });
}
