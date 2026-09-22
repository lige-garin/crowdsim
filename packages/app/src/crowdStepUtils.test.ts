import { describe, expect, it } from "vitest";
import { agentsWithinDistance, splitExitedAgents } from "./crowdStepUtils";
import type { SimulationAgent } from "./simulationEngine";

function agent(overrides: Partial<SimulationAgent>): SimulationAgent {
  return {
    id: 1,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    targetX: 0,
    targetY: 0,
    ...overrides,
  };
}

describe("splitExitedAgents", () => {
  it("moves anyone exit-bound within their own exit radius out of remaining", () => {
    const inside = agent({ id: 1, x: 0, y: 0, targetX: 0.1, targetY: 0 });
    const outside = agent({ id: 2, x: 0, y: 0, targetX: 10, targetY: 0 });

    const { exitedCount, remaining } = splitExitedAgents(
      [inside, outside],
      () => true,
      () => 0.5,
    );

    expect(exitedCount).toBe(1);
    expect(remaining).toEqual([outside]);
  });

  it("never exits anyone isExitBound says no to, however close their target is", () => {
    const close = agent({ id: 1, x: 0, y: 0, targetX: 0.1, targetY: 0 });

    const { exitedCount, remaining } = splitExitedAgents(
      [close],
      () => false,
      () => 5,
    );

    expect(exitedCount).toBe(0);
    expect(remaining).toEqual([close]);
  });
});

describe("agentsWithinDistance", () => {
  it("excludes self and anyone past the given distance", () => {
    const self = agent({ id: 1, x: 0, y: 0 });
    const near = agent({ id: 2, x: 1, y: 0 });
    const far = agent({ id: 3, x: 100, y: 0 });

    const result = agentsWithinDistance(self, [self, near, far], 5);

    expect(result.map((entry) => entry.agent.id)).toEqual([2]);
    expect(result[0].distSq).toBeCloseTo(1);
  });
});
