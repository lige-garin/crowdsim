import { describe, expect, it } from "vitest";
import {
  canAttemptHalfMillionAgents,
  createIndirectDrawPlan,
  estimateScaleBudget,
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

  it("gates the half-million agent target behind the hybrid LOD plan", () => {
    expect(
      canAttemptHalfMillionAgents(estimateScaleBudget({ agentCount: 499_999 })),
    ).toBe(false);
    expect(
      canAttemptHalfMillionAgents(estimateScaleBudget({ agentCount: 500_000 })),
    ).toBe(true);
  });

  it("builds WebGPU drawIndirect argument batches for large crowds", () => {
    const plan = createIndirectDrawPlan(500_000, 65_536);

    expect(plan.mode).toBe("drawIndirect");
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
