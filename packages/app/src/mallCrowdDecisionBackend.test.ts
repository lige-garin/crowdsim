import { describe, expect, it } from "vitest";
import { createMallCrowdDecisionBackend } from "./mallCrowdDecisionBackend";
import type {
  SimulationServicePoint,
  SimulationShop,
} from "./simulationDecisionBackend";
import type { SimulationAgent, SimulationSink } from "./simulationEngine";
import type { BrandStoreCandidate } from "./brandAttraction";

const shops: SimulationShop[] = [
  { id: "a", position: { x: 10, y: 10 }, radius: 2, attraction: 1, dwellSeconds: 5, capacity: 2, queuePosition: { x: 10, y: 14 }, conversionRate: 1 },
  { id: "b", position: { x: 50, y: 50 }, radius: 2, attraction: 1, dwellSeconds: 5, capacity: 2, queuePosition: { x: 50, y: 54 }, conversionRate: 1 },
];
const sinks: SimulationSink[] = [{ id: "exit", position: { x: 0, y: 0 }, radius: 2 }];
const servicePoints: SimulationServicePoint[] = [
  { id: "checkout1", position: { x: 5, y: 5 }, radius: 2, serviceSeconds: 3 },
];

function agent(overrides: Partial<SimulationAgent>): SimulationAgent {
  return { id: 1, x: 5, y: 5, vx: 0, vy: 0, targetX: 0, targetY: 0, ...overrides };
}

function decide(agents: SimulationAgent[], elapsedSeconds: number) {
  const backend = createMallCrowdDecisionBackend({ shops, seed: 1 });
  return backend.decideAgents({ agents, decisionTick: 0, elapsedSeconds, sinks, shops });
}

describe("createMallCrowdDecisionBackend", () => {
  it("sends a fresh agent walking to a chosen shop", () => {
    const d = decide([agent({})], 0);
    expect(d).toHaveLength(1);
    expect(d[0].nextState).toBe("walk");
    expect(shops.map((s) => s.id)).toContain(d[0].selectedStoreId);
    const shop = shops.find((s) => s.id === d[0].selectedStoreId);
    expect(d[0].target).toEqual(shop?.position);
  });

  it("starts browsing (with a dwell deadline) when the agent reaches its shop", () => {
    const d = decide(
      [agent({ lifecycleState: "walk", selectedStoreId: "a", x: 10, y: 10 })],
      0,
    );
    expect(d[0].nextState).toBe("browse");
    expect(d[0].browseUntilSeconds).toBe(5); // 0 + dwell 5
    expect(d[0].selectedStoreId).toBe("a");
  });

  it("keeps browsing until the dwell elapses (no decision emitted)", () => {
    const d = decide(
      [
        agent({
          lifecycleState: "browse",
          selectedStoreId: "a",
          browseUntilSeconds: 5,
          x: 10,
          y: 10,
        }),
      ],
      3,
    );
    expect(d).toHaveLength(0);
  });

  it("leaves toward a sink once the dwell is over", () => {
    const d = decide(
      [
        agent({
          lifecycleState: "browse",
          selectedStoreId: "a",
          browseUntilSeconds: 5,
          x: 10,
          y: 10,
        }),
      ],
      6,
    );
    expect(d[0].nextState).toBe("leave");
    expect(d[0].targetSinkId).toBe("exit");
    expect(d[0].target).toEqual({ x: 0, y: 0 });
    expect(d[0].browseUntilSeconds).toBeNull();
  });

  it("walks straight to a sink when there are no shops", () => {
    const backend = createMallCrowdDecisionBackend({ shops: [], seed: 1 });
    const d = backend.decideAgents({
      agents: [agent({})],
      decisionTick: 0,
      elapsedSeconds: 0,
      sinks,
      shops: [],
    });
    expect(d[0].nextState).toBe("leave");
    expect(d[0].targetSinkId).toBe("exit");
  });

  it("spreads agents across shops by attraction (not all to one)", () => {
    const backend = createMallCrowdDecisionBackend({ shops, seed: 7 });
    const many = Array.from({ length: 40 }, (_, i) => agent({ id: i + 1 }));
    const chosen = new Set(
      backend
        .decideAgents({ agents: many, decisionTick: 0, elapsedSeconds: 0, sinks, shops })
        .map((d) => d.selectedStoreId),
    );
    expect(chosen.size).toBeGreaterThan(1);
  });

  it("queues an arriving shopper when the shop is at capacity", () => {
    const browsers = [
      agent({ id: 1, lifecycleState: "browse", selectedStoreId: "a", browseUntilSeconds: 10, x: 10, y: 10 }),
      agent({ id: 2, lifecycleState: "browse", selectedStoreId: "a", browseUntilSeconds: 10, x: 10, y: 10 }),
    ];
    const arriving = agent({ id: 3, lifecycleState: "walk", selectedStoreId: "a", x: 10, y: 10 });
    const d = decide([...browsers, arriving], 1);
    const decided = d.find((x) => x.agentId === 3);
    expect(decided?.nextState).toBe("queue");
    expect(decided?.target).toEqual({ x: 10, y: 14 });
  });

  it("admits a queued shopper once a slot frees up", () => {
    const agents = [
      agent({ id: 1, lifecycleState: "browse", selectedStoreId: "a", browseUntilSeconds: 10, x: 10, y: 10 }),
      agent({ id: 2, lifecycleState: "queue", selectedStoreId: "a", x: 10, y: 14 }),
    ];
    const decided = decide(agents, 1).find((x) => x.agentId === 2);
    expect(decided?.nextState).toBe("browse");
    expect(decided?.browseUntilSeconds).toBe(6); // elapsed 1 + dwell 5
  });

  it("sends a buyer to checkout after browsing (when service points exist)", () => {
    const backend = createMallCrowdDecisionBackend({ shops, seed: 1 });
    const buyer = agent({ lifecycleState: "browse", selectedStoreId: "a", browseUntilSeconds: 5, x: 10, y: 10 });
    const d = backend.decideAgents({ agents: [buyer], decisionTick: 0, elapsedSeconds: 6, sinks, shops, servicePoints });
    expect(d[0].nextState).toBe("checkout");
    expect(d[0].target).toEqual({ x: 5, y: 5 });
  });

  it("starts the checkout service when the buyer reaches the counter", () => {
    const backend = createMallCrowdDecisionBackend({ shops, seed: 1 });
    const atCounter = agent({ lifecycleState: "checkout", x: 5, y: 5 });
    const d = backend.decideAgents({ agents: [atCounter], decisionTick: 0, elapsedSeconds: 0, sinks, shops, servicePoints });
    expect(d[0].nextState).toBe("enterStore");
    expect(d[0].browseUntilSeconds).toBe(3); // 0 + serviceSeconds 3
  });

  it("leaves after the checkout service completes", () => {
    const backend = createMallCrowdDecisionBackend({ shops, seed: 1 });
    const serving = agent({ lifecycleState: "enterStore", browseUntilSeconds: 3, x: 5, y: 5 });
    const d = backend.decideAgents({ agents: [serving], decisionTick: 0, elapsedSeconds: 4, sinks, shops, servicePoints });
    expect(d[0].nextState).toBe("leave");
    expect(d[0].targetSinkId).toBe("exit");
  });

  it("a non-buyer leaves straight after browsing", () => {
    const noBuyShops = shops.map((s) => ({ ...s, conversionRate: 0 }));
    const backend = createMallCrowdDecisionBackend({ shops: noBuyShops, seed: 1 });
    const browser = agent({ lifecycleState: "browse", selectedStoreId: "a", browseUntilSeconds: 5, x: 10, y: 10 });
    const d = backend.decideAgents({ agents: [browser], decisionTick: 0, elapsedSeconds: 6, sinks, shops: noBuyShops, servicePoints });
    expect(d[0].nextState).toBe("leave");
  });

  it("evacuates everyone to the nearest exit when evacuation is active", () => {
    const backend = createMallCrowdDecisionBackend({ shops, seed: 1 });
    const agents = [
      agent({ id: 1, lifecycleState: "browse", selectedStoreId: "a", x: 10, y: 10 }),
      agent({ id: 2, lifecycleState: "walk", selectedStoreId: "b", x: 30, y: 30 }),
      agent({ id: 3, lifecycleState: "queue", selectedStoreId: "a", x: 12, y: 12 }),
    ];
    const decisions = backend.decideAgents({
      agents,
      decisionTick: 0,
      elapsedSeconds: 0,
      sinks,
      shops,
      evacuationActive: true,
    });
    expect(decisions).toHaveLength(3);
    for (const d of decisions) {
      expect(d.nextState).toBe("evacuate");
      expect(d.targetSinkId).toBe("exit");
      expect(d.target).toEqual({ x: 0, y: 0 });
    }
  });

  it("does not re-issue evacuation for an already-evacuating agent", () => {
    const backend = createMallCrowdDecisionBackend({ shops, seed: 1 });
    const decisions = backend.decideAgents({
      agents: [agent({ id: 1, lifecycleState: "evacuate", x: 5, y: 5 })],
      decisionTick: 0,
      elapsedSeconds: 0,
      sinks,
      shops,
      evacuationActive: true,
    });
    expect(decisions).toHaveLength(0);
  });

  it("uses persona/brand store-choice when brand stores are provided", () => {
    const brand = (id: string, category: BrandStoreCandidate["brand"]["category"]) => ({
      id,
      name: id,
      category,
      brandPower: 0.6,
      capacity: 2,
      dwellMeanSeconds: 5,
      novelty: 0.3,
      priceTier: 3,
      promotion: 0,
      visibility: 0.5,
      queueToleranceImpact: 0.4,
      personaAffinity: {},
    });
    const brandStores: BrandStoreCandidate[] = [
      { id: "a", position: { x: 10, y: 10 }, crowdLevel: 0.2, queueLength: 0, brand: brand("ba", "fastFashion") },
      { id: "b", position: { x: 50, y: 50 }, crowdLevel: 0.2, queueLength: 0, brand: brand("bb", "coffee") },
    ];
    const backend = createMallCrowdDecisionBackend({ shops, seed: 1, brandStores });
    const fresh = Array.from({ length: 20 }, (_, i) => agent({ id: i + 1 }));
    const decisions = backend.decideAgents({
      agents: fresh,
      decisionTick: 0,
      elapsedSeconds: 0,
      sinks,
      shops,
    });
    expect(decisions.length).toBeGreaterThan(0);
    for (const d of decisions) {
      expect(d.nextState).toBe("walk");
      expect(["a", "b"]).toContain(d.selectedStoreId);
    }
  });
});
