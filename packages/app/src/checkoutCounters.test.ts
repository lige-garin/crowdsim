import { describe, expect, it } from "vitest";
import { createCounterTick } from "./checkoutCounters";
import type {
  SimulationAgentDecision,
  SimulationServicePoint,
} from "./simulationDecisionBackend";
import type { SimulationAgent } from "./simulationEngine";

const till: SimulationServicePoint = {
  id: "till",
  position: { x: 10, y: 10 },
  radius: 2,
  serviceSeconds: 30,
  servers: 2,
};

function buyer(overrides: Partial<SimulationAgent>): SimulationAgent {
  return {
    id: 1,
    lifecycleState: "checkout",
    servicePointId: "till",
    targetX: 10,
    targetY: 10,
    vx: 0,
    vy: 0,
    x: 10,
    y: 10,
    ...overrides,
  };
}

function tick(agents: SimulationAgent[], elapsedSeconds = 100) {
  const counters = createCounterTick({
    agents,
    elapsedSeconds,
    leave: (agent): SimulationAgentDecision => ({
      agentId: agent.id,
      nextState: "leave",
    }),
    patienceDeadline: () => elapsedSeconds + 60,
    seed: 1,
    servicePoints: [till],
    shops: [],
  });
  return new Map(
    agents.flatMap((agent) => {
      const decision = counters.decideCheckout(agent);
      return decision ? [[agent.id, decision] as const] : [];
    }),
  );
}

describe("checkout counters", () => {
  it("serves at most `servers` people at once and lines the rest up", () => {
    const decisions = tick([1, 2, 3, 4, 5].map((id) => buyer({ id })));
    const served = [...decisions.values()].filter((d) => d.nextState === "enterStore");
    const waiting = [...decisions.values()].filter((d) => d.queueJoinedSeconds === 100);

    expect(served).toHaveLength(2);
    expect(waiting).toHaveLength(3);
    const slots = waiting.map((d) => d.target!);
    expect(new Set(slots.map((slot) => `${slot.x},${slot.y}`)).size).toBe(3);
  });

  it("lets the head of the line in when a server frees up, not whoever is first in the list", () => {
    const decisions = tick([
      buyer({ id: 1, lifecycleState: "enterStore", browseUntilSeconds: 999 }),
      buyer({ id: 7, queueJoinedSeconds: 50, queueUntilSeconds: 999 }),
      buyer({ id: 3, queueJoinedSeconds: 20, queueUntilSeconds: 999 }),
    ]);

    expect(decisions.get(3)?.nextState).toBe("enterStore");
    expect(decisions.get(7)?.nextState).toBe("checkout");
  });

  it("sends a buyer who has waited past their patience home", () => {
    const decisions = tick([
      buyer({ id: 1, lifecycleState: "enterStore" }),
      buyer({ id: 2, lifecycleState: "enterStore" }),
      buyer({ id: 3, queueJoinedSeconds: 10, queueUntilSeconds: 90 }),
    ]);

    expect(decisions.get(3)?.nextState).toBe("leave");
  });
});
