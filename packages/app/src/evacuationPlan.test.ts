import { describe, expect, it } from "vitest";
import { createEvacuationFlowPlan } from "./evacuationPlan";
import { demoScene } from "./demoScene";
import type { SimulationAgent } from "./simulationEngine";

describe("evacuation flow plan", () => {
  it("creates a flow field to the nearest exit", () => {
    const agents: SimulationAgent[] = [
      {
        id: 1,
        x: 70,
        y: 24,
        vx: 0,
        vy: 0,
        targetX: 76,
        targetY: 24,
      },
    ];

    const plan = createEvacuationFlowPlan(demoScene, agents);

    expect(plan.exitId).toBe("east-exit");
    expect(plan.reachableCells).toBeGreaterThan(0);
    expect(plan.targetCell).toBeLessThan(plan.flowField.layout.cellCount);
    expect(plan.sampleDirection[0]).toBeGreaterThanOrEqual(0);
  });
});
