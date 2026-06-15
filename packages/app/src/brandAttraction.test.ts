import { describe, expect, it } from "vitest";
import {
  personaDefinitions,
  type AgentMindset,
  type AgentPersona,
} from "./agentPersona";
import {
  chooseBrandStore,
  createBrandStoresFromScene,
  rankBrandStores,
  scoreBrandForAgent,
} from "./brandAttraction";
import { demoScene } from "./demoScene";

describe("brand attraction model", () => {
  it("builds brand store candidates from the demo scene", () => {
    const stores = createBrandStoresFromScene(demoScene);

    expect(stores).toHaveLength(6);
    expect(stores.map((store) => store.brand.category)).toContain("luxury");
    expect(stores.every((store) => store.brand.capacity > 0)).toBe(true);
  });

  it("gives luxury buyers the strongest nearby luxury score", () => {
    const stores = createBrandStoresFromScene(demoScene);
    const ranked = rankBrandStores(mindset("luxuryBuyer"), stores, {
      agentPosition: { x: 48, y: 15 },
    });

    expect(ranked[0]?.store.id).toBe("atelier-nine");
    expect(ranked[0]?.reasons.join(" ")).toContain("brand affinity");
  });

  it("gives commuters a strong coffee preference", () => {
    const stores = createBrandStoresFromScene(demoScene);
    const ranked = rankBrandStores(mindset("commuter"), stores, {
      agentPosition: { x: 12, y: 20 },
      crowdSensitivity: 0.35,
    });

    expect(ranked[0]?.store.id).toBe("coffee-pulse");
  });

  it("boosts restaurants during meal time", () => {
    const stores = createBrandStoresFromScene(demoScene);
    const restaurant = stores.find((store) => store.id === "table-signal")!;
    const family = mindset("family");
    const base = scoreBrandForAgent(family, restaurant, {
      agentPosition: { x: 58, y: 28 },
    });
    const meal = scoreBrandForAgent(family, restaurant, {
      agentPosition: { x: 58, y: 28 },
      mealTimeBoost: 0.28,
    });

    expect(meal.breakdown.total).toBeGreaterThan(base.breakdown.total);
  });

  it("penalizes long queues for impatient agents", () => {
    const store = createBrandStoresFromScene(demoScene)[0]!;
    const commuter = mindset("commuter");
    const shortQueue = scoreBrandForAgent(
      commuter,
      { ...store, queueLength: 1 },
      {
        agentPosition: { x: 18, y: 16 },
      },
    );
    const longQueue = scoreBrandForAgent(
      commuter,
      { ...store, queueLength: 28 },
      {
        agentPosition: { x: 18, y: 16 },
      },
    );

    expect(longQueue.breakdown.total).toBeLessThan(shortQueue.breakdown.total);
  });

  it("normalizes probabilities and supports deterministic sampling", () => {
    const stores = createBrandStoresFromScene(demoScene);
    const ranked = rankBrandStores(mindset("browser"), stores, {
      agentPosition: { x: 30, y: 17 },
    });
    const probabilitySum = ranked.reduce((sum, score) => sum + score.probability, 0);
    const choice = chooseBrandStore(mindset("browser"), stores, {
      agentPosition: { x: 30, y: 17 },
      randomUnit: 0.01,
    });

    expect(probabilitySum).toBeCloseTo(1, 5);
    expect(choice?.store.id).toBe(ranked[0]?.store.id);
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
