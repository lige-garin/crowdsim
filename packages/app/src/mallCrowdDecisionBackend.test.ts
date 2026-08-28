import { describe, expect, it } from "vitest";
import { createMallCrowdDecisionBackend } from "./mallCrowdDecisionBackend";
import type {
  SimulationServicePoint,
  SimulationShop,
} from "./simulationDecisionBackend";
import type { SimulationAgent, SimulationSink } from "./simulationEngine";
import type { BrandStoreCandidate } from "./brandAttraction";
const shops: SimulationShop[] = [
  {
    id: "a",
    position: { x: 10, y: 10 },
    radius: 2,
    attraction: 1,
    dwellSeconds: 5,
    capacity: 2,
    queuePosition: { x: 10, y: 14 },
    conversionRate: 1,
  },
  {
    id: "b",
    position: { x: 50, y: 50 },
    radius: 2,
    attraction: 1,
    dwellSeconds: 5,
    capacity: 2,
    queuePosition: { x: 50, y: 54 },
    conversionRate: 1,
  },
];
const sinks: SimulationSink[] = [{ id: "exit", position: { x: 0, y: 0 }, radius: 2 }];
const servicePoints: SimulationServicePoint[] = [
  { id: "checkout1", position: { x: 5, y: 5 }, radius: 2, serviceSeconds: 3 },
];
function agent(overrides: Partial<SimulationAgent>): SimulationAgent {
  return { id: 1, x: 5, y: 5, vx: 0, vy: 0, targetX: 0, targetY: 0, ...overrides };
}
function decide(agents: SimulationAgent[], elapsedSeconds: number, decisionTick = 0) {
  const backend = createMallCrowdDecisionBackend({ shops, seed: 1 });
  return backend.decideAgents({
    agents,
    decisionTick,
    elapsedSeconds,
    sinks,
    shops,
  });
}
function browsersAt(shopId: string, count: number, from = 100): SimulationAgent[] {
  return Array.from({ length: count }, (_, index) =>
    agent({
      id: from + index,
      lifecycleState: "browse",
      selectedStoreId: shopId,
      browseUntilSeconds: 10_000,
      x: 10,
      y: 10,
    }),
  );
}
function queuersAt(shopId: string, count: number, from = 200): SimulationAgent[] {
  return Array.from({ length: count }, (_, index) =>
    agent({
      id: from + index,
      lifecycleState: "queue",
      selectedStoreId: shopId,
      queueUntilSeconds: 10_000,
      x: 10,
      y: 14,
    }),
  );
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
        .decideAgents({
          agents: many,
          decisionTick: 0,
          elapsedSeconds: 0,
          sinks,
          shops,
        })
        .map((d) => d.selectedStoreId),
    );
    expect(chosen.size).toBeGreaterThan(1);
  });

  it("favours nearer shops under gravity distance decay", () => {
    // shops a(10,10) and b(50,50) have equal attraction; agents sit next to a.
    const backend = createMallCrowdDecisionBackend({
      shops,
      seed: 7,
      distanceDecay: 0.3,
    });
    const many = Array.from({ length: 40 }, (_, i) => agent({ id: i + 1, x: 8, y: 8 }));
    const decisions = backend.decideAgents({
      agents: many,
      decisionTick: 0,
      elapsedSeconds: 0,
      sinks,
      shops,
    });
    const nearCount = decisions.filter((d) => d.selectedStoreId === "a").length;
    expect(nearCount).toBeGreaterThan(decisions.length * 0.7);
  });

  it("queues an arriving shopper when the shop is at capacity", () => {
    const browsers = [
      agent({
        id: 1,
        lifecycleState: "browse",
        selectedStoreId: "a",
        browseUntilSeconds: 10,
        x: 10,
        y: 10,
      }),
      agent({
        id: 2,
        lifecycleState: "browse",
        selectedStoreId: "a",
        browseUntilSeconds: 10,
        x: 10,
        y: 10,
      }),
    ];
    const arriving = agent({
      id: 3,
      lifecycleState: "walk",
      selectedStoreId: "a",
      x: 10,
      y: 10,
    });
    const d = decide([...browsers, arriving], 1);
    const decided = d.find((x) => x.agentId === 3);
    expect(decided?.nextState).toBe("queue");
    expect(decided?.target).toEqual({ x: 10, y: 14 });
  });

  it("admits a queued shopper once a slot frees up", () => {
    const agents = [
      agent({
        id: 1,
        lifecycleState: "browse",
        selectedStoreId: "a",
        browseUntilSeconds: 10,
        x: 10,
        y: 10,
      }),
      agent({ id: 2, lifecycleState: "queue", selectedStoreId: "a", x: 10, y: 14 }),
    ];
    const decided = decide(agents, 1).find((x) => x.agentId === 2);
    expect(decided?.nextState).toBe("browse");
    expect(decided?.browseUntilSeconds).toBe(6); // elapsed 1 + dwell 5
  });

  it("gives a queued shopper a patience deadline it can run out of", () => {
    const arriving = agent({
      id: 3,
      lifecycleState: "walk",
      selectedStoreId: "a",
      x: 10,
      y: 10,
    });
    const decided = decide([...browsersAt("a", 2), arriving], 1).find(
      (d) => d.agentId === 3,
    );

    expect(decided?.nextState).toBe("queue");
    // Patience is persona-derived: 30 s floor plus up to 120 s of trait spread.
    expect(decided?.queueUntilSeconds).toBeGreaterThan(1 + 30);
    expect(decided?.queueUntilSeconds).toBeLessThanOrEqual(1 + 150);
  });

  it("sends a shopper whose patience ran out to the next-best shop", () => {
    const impatient = agent({
      id: 3,
      lifecycleState: "queue",
      selectedStoreId: "a",
      queueUntilSeconds: 40,
      x: 10,
      y: 14,
    });
    const decided = decide([...browsersAt("a", 2), impatient], 41).find(
      (d) => d.agentId === 3,
    );

    expect(decided?.nextState).toBe("walk");
    expect(decided?.selectedStoreId).toBe("b");
    expect(decided?.queueUntilSeconds).toBeNull();
  });

  it("leaves when patience runs out and no other shop can take the shopper", () => {
    const backend = createMallCrowdDecisionBackend({ shops, seed: 1 });
    const full = shops.map((shop) => ({ ...shop, capacity: 1 }));
    const impatient = agent({
      id: 3,
      lifecycleState: "queue",
      selectedStoreId: "a",
      queueUntilSeconds: 40,
      x: 10,
      y: 14,
    });
    const decided = backend
      .decideAgents({
        agents: [
          ...browsersAt("a", 1),
          ...browsersAt("b", 1, 150),
          ...queuersAt("a", 2),
          ...queuersAt("b", 2, 250),
          impatient,
        ],
        decisionTick: 0,
        elapsedSeconds: 41,
        sinks,
        shops: full,
      })
      .find((d) => d.agentId === 3);

    expect(decided?.nextState).toBe("leave");
    expect(decided?.targetSinkId).toBe("exit");
  });

  it("balks to another shop when the line is already full", () => {
    // Capacity 2 allows 2 browsers and, at 2 line slots per service slot, 4
    // waiting shoppers; the next arrival cannot join.
    const arriving = agent({
      id: 3,
      lifecycleState: "walk",
      selectedStoreId: "a",
      x: 10,
      y: 10,
    });
    const decided = decide(
      [...browsersAt("a", 2), ...queuersAt("a", 4), arriving],
      1,
    ).find((d) => d.agentId === 3);

    expect(decided?.nextState).toBe("walk");
    expect(decided?.selectedStoreId).toBe("b");
  });

  it("records the closest approach while a walker is still making progress", () => {
    const walker = agent({
      lifecycleState: "walk",
      selectedStoreId: "a",
      walkProgress: { distance: 40, tick: 0 },
      x: 10,
      y: 40,
    });
    const decided = decide([walker], 5, 50)[0];

    expect(decided.nextState).toBe("walk");
    expect(decided.walkProgress).toEqual({ distance: 30, tick: 50 });
  });

  it("gives up on a shop it has not got closer to for the whole stall window", () => {
    const blocked = agent({
      lifecycleState: "walk",
      selectedStoreId: "a",
      walkProgress: { distance: 30, tick: 0 },
      x: 10,
      y: 40,
    });

    expect(decide([blocked], 5, 49)).toHaveLength(0);

    const decided = decide([blocked], 5, 50)[0];

    expect(decided.nextState).toBe("leave");
    expect(decided.targetSinkId).toBe("exit");
    expect(decided.walkProgress).toBeNull();
  });

  it("sends a buyer to checkout after browsing (when service points exist)", () => {
    const backend = createMallCrowdDecisionBackend({ shops, seed: 1 });
    const buyer = agent({
      lifecycleState: "browse",
      selectedStoreId: "a",
      browseUntilSeconds: 5,
      x: 10,
      y: 10,
    });
    const d = backend.decideAgents({
      agents: [buyer],
      decisionTick: 0,
      elapsedSeconds: 6,
      sinks,
      shops,
      servicePoints,
    });
    expect(d[0].nextState).toBe("checkout");
    expect(d[0].target).toEqual({ x: 5, y: 5 });
  });

  it("starts the checkout service when the buyer reaches the counter", () => {
    const backend = createMallCrowdDecisionBackend({ shops, seed: 1 });
    const atCounter = agent({ lifecycleState: "checkout", x: 5, y: 5 });
    const d = backend.decideAgents({
      agents: [atCounter],
      decisionTick: 0,
      elapsedSeconds: 0,
      sinks,
      shops,
      servicePoints,
    });
    expect(d[0].nextState).toBe("enterStore");
    expect(d[0].browseUntilSeconds).toBe(3); // 0 + serviceSeconds 3
  });

  it("leaves after the checkout service completes", () => {
    const backend = createMallCrowdDecisionBackend({ shops, seed: 1 });
    const serving = agent({
      lifecycleState: "enterStore",
      browseUntilSeconds: 3,
      x: 5,
      y: 5,
    });
    const d = backend.decideAgents({
      agents: [serving],
      decisionTick: 0,
      elapsedSeconds: 4,
      sinks,
      shops,
      servicePoints,
    });
    expect(d[0].nextState).toBe("leave");
    expect(d[0].targetSinkId).toBe("exit");
  });

  it("a non-buyer leaves straight after browsing", () => {
    const noBuyShops = shops.map((s) => ({ ...s, conversionRate: 0 }));
    const backend = createMallCrowdDecisionBackend({ shops: noBuyShops, seed: 1 });
    const browser = agent({
      lifecycleState: "browse",
      selectedStoreId: "a",
      browseUntilSeconds: 5,
      x: 10,
      y: 10,
    });
    const d = backend.decideAgents({
      agents: [browser],
      decisionTick: 0,
      elapsedSeconds: 6,
      sinks,
      shops: noBuyShops,
      servicePoints,
    });
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
      {
        id: "a",
        position: { x: 10, y: 10 },
        crowdLevel: 0.2,
        queueLength: 0,
        brand: brand("ba", "fastFashion"),
      },
      {
        id: "b",
        position: { x: 50, y: 50 },
        crowdLevel: 0.2,
        queueLength: 0,
        brand: brand("bb", "coffee"),
      },
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
