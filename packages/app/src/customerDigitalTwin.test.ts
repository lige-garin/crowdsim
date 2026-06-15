import { describe, expect, it } from "vitest";
import {
  personaDefinitions,
  type AgentMindset,
  type AgentPersona,
} from "./agentPersona";
import { createBrandStoresFromScene } from "./brandAttraction";
import { demoScene } from "./demoScene";
import {
  applyPromotionScenario,
  createCustomerTwin,
  updateCustomerTwin,
} from "./customerDigitalTwin";

describe("customer digital twin", () => {
  it("updates category affinity from entered-store events", () => {
    const twin = createCustomerTwin(mindset("browser"));
    const updated = updateCustomerTwin(twin, {
      category: "luxury",
      kind: "enteredStore",
      storeId: "atelier-nine",
    });

    expect(updated.categoryAffinity.luxury).toBeGreaterThan(
      twin.categoryAffinity.luxury,
    );
    expect(updated.observations).toBe(1);
  });

  it("can infer luxury buyer after repeated luxury evidence", () => {
    const first = createCustomerTwin({
      ...mindset("goalBuyer"),
      traits: { ...mindset("goalBuyer").traits, budget: 0.76 },
    });
    const second = updateCustomerTwin(first, {
      category: "luxury",
      kind: "enteredStore",
      storeId: "atelier-nine",
    });
    const third = updateCustomerTwin(second, {
      category: "luxury",
      kind: "enteredStore",
      storeId: "atelier-nine",
    });
    const fourth = updateCustomerTwin(third, {
      category: "luxury",
      kind: "enteredStore",
      storeId: "atelier-nine",
    });

    expect(fourth.inferredPersona).toBe("luxuryBuyer");
  });

  it("lowers budget tolerance after price rejection", () => {
    const twin = createCustomerTwin(mindset("commuter"));
    const updated = updateCustomerTwin(twin, {
      kind: "rejectedPrice",
      priceTier: 5,
      storeId: "atelier-nine",
    });

    expect(updated.traits.budget).toBeLessThan(twin.traits.budget);
    expect(updated.traits.riskAvoidance).toBeGreaterThan(twin.traits.riskAvoidance);
  });

  it("applies scoped promotion lift without mutating other stores", () => {
    const stores = createBrandStoresFromScene(demoScene);
    const promoted = applyPromotionScenario(stores, {
      category: "fastFashion",
      lift: 0.3,
    });
    const before = stores.find((store) => store.id === "mono-thread")!;
    const after = promoted.find((store) => store.id === "mono-thread")!;
    const coffee = promoted.find((store) => store.id === "coffee-pulse")!;

    expect(after.brand.promotion).toBeGreaterThan(before.brand.promotion);
    expect(coffee.brand.promotion).toBe(
      stores.find((store) => store.id === "coffee-pulse")!.brand.promotion,
    );
  });
});

function mindset(persona: AgentPersona): AgentMindset {
  const definition = personaDefinitions[persona];

  return {
    currentIntent: definition.intents[0].intent,
    id: 1,
    intentWeights: definition.intents,
    persona,
    traits: definition.traits,
  };
}
