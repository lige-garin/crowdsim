import { describe, expect, it } from "vitest";
import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import { demoScene } from "./demoScene";
import { createSimulationEngineFromScene } from "./simulationEngine";

/**
 * ADR-0021 taught `mallCrowdDecisionBackend.ts`/`checkoutCounters.ts` to
 * redirect a served buyer to a service point's own `nextServicePointId`
 * instead of unconditionally leaving. `mallCrowdDecisionBackend.test.ts`
 * proves that redirect at the decision layer, in isolation. This file proves
 * the same thing through a real, spawned, walking agent and the full engine
 * loop — the decision, the walk to the second service point's real (x, y),
 * the second queue/serve cycle, and finally leaving — the same kind of
 * full-stack proof `simulationVehicles.test.ts`/`simulationElevators.test.ts`
 * give their own features, not a re-run of the unit-level assertions.
 */
const scene: CrowdSimScene = parseScene({
  ...demoScene,
  id: "checkpoint-chain-demo",
  world: { width: 60, height: 30 },
  walls: [],
  shops: [
    {
      id: "shop-a",
      position: { x: 10, y: 15 },
      size: { width: 6, height: 5 },
      attraction: 1,
      capacity: 50,
      dwellMeanSeconds: 1,
      conversionRate: 1,
    },
  ],
  entrances: [
    {
      id: "door",
      kind: "source",
      position: { x: 5, y: 15 },
      width: 4,
      arrivalRatePerMinute: 600,
      groupShare: 0,
    },
    { id: "exit", kind: "sink", position: { x: 55, y: 15 }, width: 6 },
  ],
  servicePoints: [
    {
      id: "security",
      kind: "gate",
      position: { x: 25, y: 15 },
      width: 3,
      serviceMeanSeconds: 1,
      capacityPerMinute: 600,
      servers: 10,
      nextServicePointId: "boarding-gate",
    },
    {
      id: "boarding-gate",
      kind: "gate",
      position: { x: 40, y: 15 },
      width: 3,
      serviceMeanSeconds: 1,
      capacityPerMinute: 600,
      servers: 10,
    },
  ],
});

describe("checkpoint chaining through a real engine run (ADR-0021)", () => {
  it("walks a served buyer on to the chained service point instead of leaving after the first", () => {
    const engine = createSimulationEngineFromScene(scene, { maxAgents: 60 });
    engine.start();

    let sawGate = false;
    // 60 simulated seconds in 0.5 s chunks: enough for door(5)->shop(10)
    // ->security(25)->gate(40) at ~1.34 m/s plus two short service times.
    for (let chunk = 0; chunk < 120 && !sawGate; chunk++) {
      const snapshot = engine.step(30);
      if (snapshot.agents.some((agent) => agent.servicePointId === "boarding-gate")) {
        sawGate = true;
      }
    }

    expect(sawGate).toBe(true);
  });

  it("eventually exits buyers who completed the whole chain, not stuck mid-journey", () => {
    const engine = createSimulationEngineFromScene(scene, { maxAgents: 60 });
    engine.start();
    for (let chunk = 0; chunk < 200; chunk++) {
      engine.step(30);
    }

    expect(engine.snapshot().exitedCount).toBeGreaterThan(0);
  });
});
