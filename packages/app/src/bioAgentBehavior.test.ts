import { describe, expect, it } from "vitest";
import { parseScene } from "@crowdsim/scene-schema";
import { bioCityDemoScene } from "./bioCityDemoScene";
import {
  createBioCityDecisionBackend,
  decideBioAgentBehavior,
  shouldUseBioCityDecisionBackend,
} from "./bioAgentBehavior";

const sinks = [
  {
    id: "safe-exit",
    position: { x: 150, y: 52 },
    radius: 5,
  },
];

describe("bio agent behavior", () => {
  it("evacuates when local BioCity hazard exceeds profile risk tolerance", () => {
    const decision = decideBioAgentBehavior({
      agent: {
        id: 1,
        targetX: 0,
        targetY: 0,
        vx: 0,
        vy: 0,
        x: 98,
        y: 58,
      },
      elapsedSeconds: 1200,
      scene: bioCityDemoScene,
      sinks,
    });

    expect(decision.nextState).toBe("evacuate");
    expect(decision.targetSinkId).toBe("safe-exit");
    expect(decision.explanation.join(" ")).toContain("risk");
  });

  it("selects transit stops for low-risk commuter behavior", () => {
    const decision = decideBioAgentBehavior({
      agent: {
        id: 1,
        targetX: 0,
        targetY: 0,
        vx: 0,
        vy: 0,
        x: 110,
        y: 70,
      },
      elapsedSeconds: 0,
      scene: bioCityDemoScene,
      sinks,
    });

    expect(["walk", "queue"]).toContain(decision.nextState);
    expect(decision.target).toEqual({ x: 122, y: 72 });
    expect(decision.explanation.join(" ")).toContain("transit");
  });

  it("selects commercial targets for spending-oriented shoppers", () => {
    const shopperScene = parseScene({
      ...bioCityDemoScene,
      hazards: [],
      transitStops: [],
      bioAgentProfiles: [
        {
          id: "shopper",
          name: "Shopper",
          kind: "shopper",
          spendingIntent: 0.92,
          riskTolerance: 0.6,
          shelterPreference: 0.3,
          weatherSensitivity: 0.2,
        },
      ],
    });
    const decision = decideBioAgentBehavior({
      agent: {
        id: 1,
        targetX: 0,
        targetY: 0,
        vx: 0,
        vy: 0,
        x: 36,
        y: 44,
      },
      elapsedSeconds: 0,
      scene: shopperScene,
      sinks,
    });

    expect(["enterStore", "queue"]).toContain(decision.nextState);
    expect(decision.selectedStoreId).toBeDefined();
    expect(decision.explanation.join(" ")).toContain("spending intent");
  });

  it("adapts BioCity decisions to the simulation decision backend", () => {
    const backend = createBioCityDecisionBackend(bioCityDemoScene);
    const decisions = backend.decideAgents({
      agents: [
        {
          id: 1,
          targetX: 0,
          targetY: 0,
          vx: 0,
          vy: 0,
          x: 110,
          y: 70,
        },
      ],
      decisionTick: 1,
      elapsedSeconds: 0,
      sinks,
    });

    expect(shouldUseBioCityDecisionBackend(bioCityDemoScene)).toBe(true);
    expect(decisions[0]).toMatchObject({
      agentId: 1,
      nextState: expect.any(String),
      target: { x: 122, y: 72 },
    });
  });
});
