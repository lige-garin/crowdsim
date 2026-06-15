import { describe, expect, it } from "vitest";
import { createAgentMindset } from "./agentPersona";
import { decideAgentLifecycleState } from "./agentLifecycle";
import type { BrandStoreCandidate } from "./brandAttraction";
import { clearEnvironmentImpact } from "./environmentEffects";

const stores: BrandStoreCandidate[] = [
  {
    brand: {
      brandPower: 0.9,
      capacity: 20,
      category: "jewelry",
      dwellMeanSeconds: 260,
      id: "brand-a",
      name: "Brand A",
      novelty: 0.5,
      personaAffinity: { luxuryBuyer: 0.95, browser: 0.7 },
      priceTier: 5,
      promotion: 0.2,
      queueToleranceImpact: 0.45,
      visibility: 0.9,
    },
    crowdLevel: 0.2,
    id: "shop-a",
    position: { x: 10, y: 10 },
    queueLength: 2,
  },
];

describe("agent lifecycle decisions", () => {
  it("chooses a store lifecycle state from brand pull and queue pressure", () => {
    const decision = decideAgentLifecycleState({
      agent: createAgentMindset({ agentId: 4, seed: 11 }),
      environment: clearEnvironmentImpact,
      position: { x: 11, y: 11 },
      stores,
    });

    expect(["enterStore", "queue"]).toContain(decision.nextState);
    expect(decision.selectedStoreId).toBe("shop-a");
    expect(decision.explanation.join(" ")).toContain("brand affinity");
  });

  it("switches to evacuation when environmental risk is high", () => {
    const decision = decideAgentLifecycleState({
      agent: createAgentMindset({ agentId: 4, seed: 11 }),
      environment: { ...clearEnvironmentImpact, riskScore: 0.7 },
      position: { x: 11, y: 11 },
      stores,
    });

    expect(decision.nextState).toBe("evacuate");
  });
});
