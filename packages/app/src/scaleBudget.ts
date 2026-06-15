export type ScaleBudgetInput = {
  agentCount: number;
  bytesPerAgent?: number;
  targetFramesPerSecond?: number;
};

export type ScaleBudget = {
  agentCount: number;
  estimatedAgentMemoryMegabytes: number;
  renderStrategy: "gpu-instanced" | "hybrid-lod" | "webgpu-indirect";
  targetFramesPerSecond: number;
  warningLevel: "green" | "red" | "yellow";
};

export type IndirectDrawArgs = {
  firstInstance: number;
  firstVertex: number;
  instanceCount: number;
  vertexCount: number;
};

export type IndirectDrawPlan = {
  argsBufferBytes: number;
  batchCount: number;
  draws: IndirectDrawArgs[];
  mode: "drawIndirect";
};

const defaultBytesPerAgent = 64;
const agentQuadVertexCount = 6;

export function estimateScaleBudget(input: ScaleBudgetInput): ScaleBudget {
  const agentCount = Math.max(0, Math.floor(input.agentCount));
  const targetFramesPerSecond = input.targetFramesPerSecond ?? 30;
  const estimatedAgentMemoryMegabytes = Number(
    (
      (agentCount * (input.bytesPerAgent ?? defaultBytesPerAgent)) /
      1024 /
      1024
    ).toFixed(2),
  );

  return {
    agentCount,
    estimatedAgentMemoryMegabytes,
    renderStrategy:
      agentCount >= 500_000
        ? "webgpu-indirect"
        : agentCount >= 100_000
          ? "hybrid-lod"
          : "gpu-instanced",
    targetFramesPerSecond,
    warningLevel:
      agentCount >= 500_000 || estimatedAgentMemoryMegabytes > 64
        ? "red"
        : agentCount >= 100_000
          ? "yellow"
          : "green",
  };
}

export function canAttemptHalfMillionAgents(budget: ScaleBudget) {
  return (
    budget.agentCount >= 500_000 &&
    budget.renderStrategy === "webgpu-indirect" &&
    budget.estimatedAgentMemoryMegabytes <= 128
  );
}

export function createIndirectDrawPlan(agentCount: number, batchSize = 65_536) {
  const safeAgentCount = Math.max(0, Math.floor(agentCount));
  const safeBatchSize = Math.max(1, Math.floor(batchSize));
  const batchCount = Math.ceil(safeAgentCount / safeBatchSize);
  const draws = Array.from({ length: batchCount }, (_, batchIndex) => {
    const firstInstance = batchIndex * safeBatchSize;
    const remaining = safeAgentCount - firstInstance;

    return {
      firstInstance,
      firstVertex: 0,
      instanceCount: Math.min(safeBatchSize, remaining),
      vertexCount: agentQuadVertexCount,
    };
  });

  return {
    argsBufferBytes: draws.length * 4 * Uint32Array.BYTES_PER_ELEMENT,
    batchCount,
    draws,
    mode: "drawIndirect" as const,
  };
}
