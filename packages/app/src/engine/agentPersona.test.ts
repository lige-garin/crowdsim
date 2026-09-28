import { describe, expect, it } from "vitest";
import {
  createAgentCohort,
  createAgentMindset,
  intentWeight,
  personaDefinitions,
} from "./agentPersona";

describe("agent persona model", () => {
  it("creates deterministic personas from agent id and seed", () => {
    const first = createAgentMindset({ agentId: 7, seed: 2026 });
    const second = createAgentMindset({ agentId: 7, seed: 2026 });

    expect(second).toEqual(first);
    expect(Object.keys(personaDefinitions)).toContain(first.persona);
  });

  it("keeps all trait values inside the normalized range", () => {
    const cohort = createAgentCohort({ count: 24, seed: 9 });

    for (const mindset of cohort) {
      for (const value of Object.values(mindset.traits)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it("boosts exit intent for high time-pressure commuters", () => {
    const commuter = createAgentCohort({ count: 40, seed: 11 }).find(
      (mindset) => mindset.persona === "commuter",
    );

    expect(commuter).toBeDefined();
    expect(intentWeight(commuter!, "goToExit")).toBeGreaterThan(0.72);
  });

  it("forces evacuation intent when evacuation is active", () => {
    const mindset = createAgentMindset({
      agentId: 4,
      evacuationActive: true,
      seed: 2026,
    });

    expect(mindset.currentIntent).toBe("evacuate");
  });
});
