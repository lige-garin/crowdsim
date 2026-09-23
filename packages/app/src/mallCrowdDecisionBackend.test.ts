import { describe, expect, it } from "vitest";
import {
  browseSpot,
  createMallCrowdDecisionBackend,
  queueSlotPosition,
} from "./mallCrowdDecisionBackend";
import { queueSpacingMeters } from "./checkoutCounters";
import { sampleDwellSeconds, sampleServiceSeconds } from "./behaviorDistributions";
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
    // 0 + this shopper's own draw around the shop's 5 s mean dwell.
    expect(d[0].browseUntilSeconds).toBe(sampleDwellSeconds(5, 1, 1, "a"));
    expect(d[0].browseUntilSeconds).not.toBe(5);
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
    expect(decided?.browseUntilSeconds).toBe(1 + sampleDwellSeconds(5, 1, 2, "a"));
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
    const atCounter = agent({
      lifecycleState: "checkout",
      servicePointId: "checkout1",
      x: 5,
      y: 5,
    });
    const d = backend.decideAgents({
      agents: [atCounter],
      decisionTick: 0,
      elapsedSeconds: 0,
      sinks,
      shops,
      servicePoints,
    });
    expect(d[0].nextState).toBe("enterStore");
    // 0 + this buyer's Erlang draw around the counter's 3 s mean.
    expect(d[0].browseUntilSeconds).toBe(sampleServiceSeconds(3, 1, 1, "checkout1"));
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

  it("chains a served buyer to the next service point instead of leaving (ADR-0021)", () => {
    const chained: SimulationServicePoint[] = [
      {
        id: "security",
        position: { x: 5, y: 5 },
        radius: 2,
        serviceSeconds: 3,
        nextServicePointId: "gate",
      },
      { id: "gate", position: { x: 8, y: 8 }, radius: 2, serviceSeconds: 2 },
    ];
    const backend = createMallCrowdDecisionBackend({ shops, seed: 1 });
    const serving = agent({
      id: 1,
      lifecycleState: "enterStore",
      servicePointId: "security",
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
      servicePoints: chained,
    });
    expect(d[0].nextState).toBe("checkout");
    expect(d[0].servicePointId).toBe("gate");
    expect(d[0].target).toEqual({ x: 8, y: 8 });
    expect(d[0].checkpointHopCount).toBe(1);
  });

  it("stops chaining exactly at the hop safety cap, rather than cycling forever", () => {
    // A chains to B chains to A: a scene-authoring mistake, not a real
    // journey. Tests both sides of the boundary — one hop under the cap
    // still chains, so this cannot pass simply because chaining never
    // happens at all; only right at the cap does it stop.
    const cycle: SimulationServicePoint[] = [
      {
        id: "a",
        position: { x: 5, y: 5 },
        radius: 2,
        serviceSeconds: 1,
        nextServicePointId: "b",
      },
      {
        id: "b",
        position: { x: 6, y: 6 },
        radius: 2,
        serviceSeconds: 1,
        nextServicePointId: "a",
      },
    ];
    const backend = createMallCrowdDecisionBackend({ shops, seed: 1 });
    const servingAt = (id: number, hopCount: number) =>
      agent({
        id,
        lifecycleState: "enterStore",
        servicePointId: "a",
        browseUntilSeconds: 3,
        checkpointHopCount: hopCount,
        x: 5,
        y: 5,
      });
    const d = backend.decideAgents({
      agents: [servingAt(1, 7), servingAt(2, 8)],
      decisionTick: 0,
      elapsedSeconds: 4,
      sinks,
      shops,
      servicePoints: cycle,
    });
    const byId = new Map(d.map((decision) => [decision.agentId, decision]));

    expect(byId.get(1)?.nextState).toBe("checkout");
    expect(byId.get(1)?.checkpointHopCount).toBe(8);
    expect(byId.get(2)?.nextState).toBe("leave");
  });

  it("leaves when a service point's nextServicePointId points at nothing in the scene", () => {
    const dangling: SimulationServicePoint[] = [
      {
        id: "security",
        position: { x: 5, y: 5 },
        radius: 2,
        serviceSeconds: 3,
        nextServicePointId: "does-not-exist",
      },
    ];
    const backend = createMallCrowdDecisionBackend({ shops, seed: 1 });
    const serving = agent({
      id: 1,
      lifecycleState: "enterStore",
      servicePointId: "security",
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
      servicePoints: dangling,
    });
    expect(d[0].nextState).toBe("leave");
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
      // A minute past the alarm, so every pre-movement time has run out.
      // Nobody starts on the alarm's own tick — see the reaction cases below.
      elapsedSeconds: 60,
      evacuationStartedSeconds: 0,
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

  it("does not start anyone moving on the alarm's own tick", () => {
    const backend = createMallCrowdDecisionBackend({ shops, seed: 1 });
    const agents = [agent({ id: 1, lifecycleState: "browse", x: 10, y: 10 })];
    const decisions = backend.decideAgents({
      agents,
      decisionTick: 0,
      elapsedSeconds: 10,
      evacuationStartedSeconds: 10,
      sinks,
      shops,
      evacuationActive: true,
    });

    // Everyone starting at once is what evacuation models stopped doing
    // decades ago: pre-movement time is the largest single term in most
    // recorded evacuations.
    expect(decisions).toHaveLength(0);
  });

  it("starts people at different times rather than all at once", () => {
    const backend = createMallCrowdDecisionBackend({ shops, seed: 1 });
    const agents = Array.from({ length: 40 }, (_, index) =>
      agent({ id: index + 1, lifecycleState: "browse", x: 10, y: 10 }),
    );
    const movedBy = (elapsed: number) =>
      backend
        .decideAgents({
          agents,
          decisionTick: 0,
          elapsedSeconds: elapsed,
          evacuationStartedSeconds: 0,
          sinks,
          shops,
          evacuationActive: true,
        })
        .filter((decision) => decision.nextState === "evacuate").length;

    // Spread, not a step: some have gone by 5 s, most by 30 s, and it is
    // never everyone on one tick.
    const at5 = movedBy(5);
    const at15 = movedBy(15);
    const at30 = movedBy(30);
    expect(at5).toBeLessThan(at15);
    expect(at15).toBeLessThan(at30);
    expect(at5).toBeGreaterThan(0);
    expect(at30).toBeLessThan(agents.length);
    expect(at30).toBeGreaterThan(agents.length / 2);
  });

  it("sends evacuees to the nearest exit whatever their entrance allows", () => {
    const backend = createMallCrowdDecisionBackend({ shops, seed: 1 });
    const decisions = backend.decideAgents({
      agents: [
        agent({ id: 1, lifecycleState: "browse", x: 10, y: 5, exitIds: ["far"] }),
      ],
      decisionTick: 0,
      elapsedSeconds: 60,
      evacuationStartedSeconds: 0,
      sinks: [
        { id: "near", position: { x: 6, y: 5 }, radius: 2 },
        { id: "far", position: { x: 90, y: 5 }, radius: 2 },
      ],
      shops,
      evacuationActive: true,
    });

    // Which door you came in by is a routing rule for a normal day, not a
    // constraint on getting out.
    expect(decisions).toHaveLength(1);
    expect(decisions[0].targetSinkId).toBe("near");
  });

  it("spreads evacuees over the exits rather than all at the nearest", () => {
    const backend = createMallCrowdDecisionBackend({ shops, seed: 1 });
    // Everyone at the west end, so the west door is nearest to all twenty.
    const crowd = Array.from({ length: 20 }, (_, index) =>
      agent({ id: index + 1, lifecycleState: "browse", x: 2, y: 5 }),
    );
    const decisions = backend.decideAgents({
      agents: crowd,
      decisionTick: 0,
      elapsedSeconds: 90,
      evacuationStartedSeconds: 0,
      sinks: [
        { id: "west", position: { x: 0, y: 5 }, radius: 2 },
        { id: "east", position: { x: 60, y: 5 }, radius: 2 },
      ],
      shops,
      evacuationActive: true,
    });

    // "Nearest exit" for everyone jams one door while the other stands empty.
    const chosen = new Set(decisions.map((decision) => decision.targetSinkId));
    expect(chosen.size).toBe(2);
    expect(chosen.has("east")).toBe(true);
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

describe("brand store choice reads the live crowd", () => {
  const roomyShops: SimulationShop[] = shops.map((shop) => ({ ...shop, capacity: 20 }));
  const sameBrand = (id: string): BrandStoreCandidate => ({
    id,
    position: roomyShops.find((shop) => shop.id === id)!.position,
    crowdLevel: 0,
    queueLength: 0,
    brand: {
      id: `brand-${id}`,
      name: id,
      category: "coffee",
      brandPower: 0.6,
      capacity: 20,
      dwellMeanSeconds: 5,
      novelty: 0.3,
      priceTier: 2,
      promotion: 0,
      visibility: 0.5,
      queueToleranceImpact: 0.4,
      personaAffinity: {},
    },
  });

  it("steers fresh shoppers away from a packed store with a long line", () => {
    // Two identical coffee shops, equally far from the shoppers. Shop "a" is
    // listed first; the old made-up load favoured it for that reason alone.
    const load = [...browsersAt("a", 18, 1000), ...queuersAt("a", 30, 2000)];
    const picks = { a: 0, b: 0 };

    for (let id = 1; id <= 400; id++) {
      const backend = createMallCrowdDecisionBackend({
        shops: roomyShops,
        seed: id,
        brandStores: [sameBrand("a"), sameBrand("b")],
      });
      const decision = backend
        .decideAgents({
          agents: [...load, agent({ id, x: 30, y: 30 })],
          decisionTick: 0,
          elapsedSeconds: 0,
          sinks,
          shops: roomyShops,
        })
        .find((candidate) => candidate.agentId === id);
      if (decision?.selectedStoreId === "a" || decision?.selectedStoreId === "b") {
        picks[decision.selectedStoreId] += 1;
      }
    }

    expect(picks.a + picks.b).toBe(400);
    expect(picks.b).toBeGreaterThan(picks.a * 1.3);
  });
});

describe("lines and shop floors", () => {
  const lineShop: SimulationShop = {
    ...shops[0],
    capacity: 1,
    queuePosition: { x: 10, y: 14 },
    queueDirection: { x: 0, y: 1 },
    browseArea: { x: 10, y: 6, halfWidth: 3, halfHeight: 2 },
  };

  it("stands a line in order of arrival, one spacing apart, and lets the head in first", () => {
    const backend = createMallCrowdDecisionBackend({ shops: [lineShop], seed: 3 });
    // Array order is the reverse of arrival order: the old rule let agent 30 in.
    const queuers = [30, 20, 10].map((id) =>
      agent({
        id,
        lifecycleState: "queue",
        selectedStoreId: "a",
        queueJoinedSeconds: id,
        queueUntilSeconds: 10_000,
        targetX: 0,
        targetY: 0,
      }),
    );
    const decisions = backend.decideAgents({
      agents: queuers,
      decisionTick: 0,
      elapsedSeconds: 50,
      sinks,
      shops: [lineShop],
    });
    const byId = new Map(decisions.map((decision) => [decision.agentId, decision]));

    expect(byId.get(10)?.nextState).toBe("browse");
    expect(byId.get(20)?.target).toEqual(queueSlotPosition(lineShop, 0));
    expect(byId.get(30)?.target).toEqual(queueSlotPosition(lineShop, 1));
    expect(
      queueSlotPosition(lineShop, 1).y - queueSlotPosition(lineShop, 0).y,
    ).toBeCloseTo(queueSpacingMeters);
  });

  it("spreads browsers over the shop floor instead of one point", () => {
    const spots = Array.from({ length: 30 }, (_, index) =>
      browseSpot(lineShop, 3, index + 1),
    );
    const distinct = new Set(
      spots.map((spot) => `${spot.x.toFixed(2)},${spot.y.toFixed(2)}`),
    );

    expect(distinct.size).toBe(30);
    for (const spot of spots) {
      expect(Math.abs(spot.x - 10)).toBeLessThanOrEqual(3);
      expect(Math.abs(spot.y - 6)).toBeLessThanOrEqual(2);
    }
    expect(browseSpot(lineShop, 3, 7)).toEqual(browseSpot(lineShop, 3, 7));
  });
});
