import { describe, expect, it } from "vitest";
import { buildCrowdContactNetwork } from "./crowdContactNetwork";
import type { SimulationAgent } from "./simulationEngine";

function agent(o: Partial<SimulationAgent>): SimulationAgent {
  return { id: 1, x: 0, y: 0, vx: 0, vy: 0, targetX: 0, targetY: 0, ...o };
}

const world = { worldWidth: 100, worldHeight: 100 };

describe("buildCrowdContactNetwork", () => {
  it("links two agents within proximity", () => {
    const net = buildCrowdContactNetwork(
      [
        agent({ id: 1, x: 10, y: 10, lifecycleState: "browse" }),
        agent({ id: 2, x: 11, y: 10, lifecycleState: "browse" }),
      ],
      { ...world, proximityMeters: 3 },
    );
    expect(net.nodes).toHaveLength(2);
    expect(net.links).toHaveLength(1);
  });

  it("does not link agents that are far apart", () => {
    const net = buildCrowdContactNetwork(
      [
        agent({ id: 1, x: 10, y: 10, lifecycleState: "walk" }),
        agent({ id: 2, x: 80, y: 80, lifecycleState: "walk" }),
      ],
      { ...world, proximityMeters: 3 },
    );
    expect(net.links).toHaveLength(0);
  });

  it("marks a same-shop contact when both are at the same store", () => {
    const net = buildCrowdContactNetwork(
      [
        agent({ id: 1, x: 10, y: 10, lifecycleState: "browse", selectedStoreId: "a" }),
        agent({ id: 2, x: 11, y: 10, lifecycleState: "browse", selectedStoreId: "a" }),
      ],
      { ...world, proximityMeters: 3 },
    );
    expect(net.links[0].kind).toBe("sameShop");
  });

  it("marks a queue contact when both are queuing the same store", () => {
    const net = buildCrowdContactNetwork(
      [
        agent({ id: 1, x: 10, y: 10, lifecycleState: "queue", selectedStoreId: "a" }),
        agent({ id: 2, x: 11, y: 10, lifecycleState: "queue", selectedStoreId: "a" }),
      ],
      { ...world, proximityMeters: 3 },
    );
    expect(net.links[0].kind).toBe("queue");
  });

  it("projects agent world position to view percent", () => {
    const net = buildCrowdContactNetwork(
      [
        agent({ id: 1, x: 50, y: 25, lifecycleState: "walk" }),
        agent({ id: 2, x: 51, y: 25, lifecycleState: "walk" }),
      ],
      { worldWidth: 100, worldHeight: 50, proximityMeters: 3 },
    );
    const node = net.nodes.find((n) => n.id === "agent-1");
    expect(node?.xPercent).toBeCloseTo(50);
    expect(node?.yPercent).toBeCloseTo(50);
  });

  it("caps the node count at maxNodes", () => {
    const agents = Array.from({ length: 20 }, (_, i) =>
      agent({ id: i + 1, x: i * 0.4, y: 0, lifecycleState: "browse" }),
    );
    const net = buildCrowdContactNetwork(agents, {
      ...world,
      proximityMeters: 3,
      maxNodes: 6,
    });
    expect(net.nodes.length).toBeLessThanOrEqual(6);
  });

  it("returns an empty network for no agents", () => {
    const net = buildCrowdContactNetwork([], world);
    expect(net.nodes).toHaveLength(0);
    expect(net.links).toHaveLength(0);
  });
});
