import { describe, expect, it } from "vitest";
import { createMallCrowdDecisionBackend } from "./mallCrowdDecisionBackend";
import type { SimulationShop } from "./simulationDecisionBackend";
import type { SimulationAgent, SimulationSink } from "./simulationEngine";

const shops: SimulationShop[] = [
  { id: "a", position: { x: 10, y: 10 }, radius: 2, attraction: 1, dwellSeconds: 5 },
  { id: "b", position: { x: 50, y: 50 }, radius: 2, attraction: 1, dwellSeconds: 5 },
];
const sinks: SimulationSink[] = [{ id: "exit", position: { x: 0, y: 0 }, radius: 2 }];

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
});
