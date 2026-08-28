import { describe, expect, it } from "vitest";
import {
  createIndirectDrawPlan,
  estimateScaleBudget,
  projectHalfMillionAgentBudget,
} from "./scaleBudget";

describe("scale budget", () => {
  it("selects render strategy and warning level by agent count", () => {
    expect(estimateScaleBudget({ agentCount: 20_000 })).toMatchObject({
      renderStrategy: "gpu-instanced",
      warningLevel: "green",
    });
    expect(estimateScaleBudget({ agentCount: 150_000 })).toMatchObject({
      renderStrategy: "hybrid-lod",
      warningLevel: "yellow",
    });
    expect(estimateScaleBudget({ agentCount: 500_000 })).toMatchObject({
      estimatedAgentMemoryMegabytes: 30.52,
      renderStrategy: "webgpu-indirect",
      warningLevel: "red",
    });
  });

  it("projects the half-million target without claiming it was measured", () => {
    const projection = projectHalfMillionAgentBudget(
      estimateScaleBudget({ agentCount: 500_000 }),
    );

    expect(projection.projection).toBe("within-budget");
    expect(projection.measurement).toBe("not-measured");
    expect(projection.blockers).toEqual([]);
  });

  it("reports the agent count as a blocker below the target", () => {
    const projection = projectHalfMillionAgentBudget(
      estimateScaleBudget({ agentCount: 499_999 }),
    );

    expect(projection.projection).toBe("over-budget");
    expect(projection.blockers).toEqual([
      "agent count 499999 is below the 500000 target",
    ]);
  });

  it("reports over-budget against a caller-supplied memory ceiling", () => {
    const projection = projectHalfMillionAgentBudget(
      estimateScaleBudget({ agentCount: 500_000 }),
      { memoryBudgetMegabytes: 16, targetAgentCount: 500_000 },
    );

    expect(projection.projection).toBe("over-budget");
    expect(projection.blockers).toEqual([
      "estimated 30.52 MB exceeds the 16 MB budget",
    ]);
  });

  it("builds drawIndirect argument batches for a mode that is not wired yet", () => {
    const plan = createIndirectDrawPlan(500_000, 65_536);

    expect(plan.mode).toBe("planned-drawIndirect");
    expect(plan.batchCount).toBe(8);
    expect(plan.argsBufferBytes).toBe(128);
    expect(plan.draws[0]).toEqual({
      firstInstance: 0,
      firstVertex: 0,
      instanceCount: 65_536,
      vertexCount: 6,
    });
    expect(plan.draws.at(-1)?.instanceCount).toBe(41_248);
  });
});
