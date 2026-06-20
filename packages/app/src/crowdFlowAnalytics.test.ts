import { describe, expect, it } from "vitest";
import { crowdFlowAnalytics } from "./crowdFlowAnalytics";
import type { SimulationShop } from "./simulationDecisionBackend";
import type { SimulationAgent } from "./simulationEngine";

const shops: Pick<SimulationShop, "id">[] = [{ id: "a" }, { id: "b" }];

function agent(o: Partial<SimulationAgent>): SimulationAgent {
  return { id: 1, x: 0, y: 0, vx: 0, vy: 0, targetX: 0, targetY: 0, ...o };
}

describe("crowdFlowAnalytics", () => {
  const agents = [
    agent({ id: 1, lifecycleState: "browse", selectedStoreId: "a" }),
    agent({ id: 2, lifecycleState: "browse", selectedStoreId: "a" }),
    agent({ id: 3, lifecycleState: "queue", selectedStoreId: "a" }),
    agent({ id: 4, lifecycleState: "browse", selectedStoreId: "b" }),
    agent({ id: 5, lifecycleState: "walk", selectedStoreId: "b" }), // en route
    agent({ id: 6, lifecycleState: "leave" }), // leaving
  ];
  const flow = crowdFlowAnalytics(agents, shops);

  it("counts browsing and queuing per shop", () => {
    expect(flow.perShop).toEqual([
      { id: "a", browsing: 2, queuing: 1 },
      { id: "b", browsing: 1, queuing: 0 },
    ]);
  });

  it("totals shopping and queuing across shops (walking/leaving excluded)", () => {
    expect(flow.totalShopping).toBe(3);
    expect(flow.totalQueuing).toBe(1);
  });

  it("identifies the busiest shop by browsers", () => {
    expect(flow.busiestShopId).toBe("a");
  });

  it("returns zeroes for an empty crowd", () => {
    const empty = crowdFlowAnalytics([], shops);
    expect(empty.totalShopping).toBe(0);
    expect(empty.totalQueuing).toBe(0);
    expect(empty.busiestShopId).toBeNull();
  });
});
