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

// Nothing in this repo issues a drawIndirect/drawIndexedIndirect call: the mode
// string was the only occurrence of the word outside docs. The plan is real
// arithmetic (batch sizes and the args buffer a renderer would need), so it is
// labelled as the planned mode rather than an implemented one.
export type IndirectDrawPlan = {
  argsBufferBytes: number;
  batchCount: number;
  draws: IndirectDrawArgs[];
  mode: "planned-drawIndirect";
};

export type ScaleProjectionLimits = {
  memoryBudgetMegabytes: number;
  targetAgentCount: number;
};

// Not a readiness verdict. Every number below comes from `estimateScaleBudget`
// arithmetic; no 500k run has been executed (docs/BENCHMARKS.md is PENDING and
// the sandbox has no WebGPU), which is what `measurement: "not-measured"` says.
export type HalfMillionAgentProjection = {
  blockers: readonly string[];
  estimatedAgentMemoryMegabytes: number;
  measurement: "not-measured";
  memoryBudgetMegabytes: number;
  projection: "over-budget" | "within-budget";
  targetAgentCount: number;
};

export const defaultHalfMillionProjectionLimits: ScaleProjectionLimits = {
  memoryBudgetMegabytes: 128,
  targetAgentCount: 500_000,
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

export function projectHalfMillionAgentBudget(
  budget: ScaleBudget,
  limits: ScaleProjectionLimits = defaultHalfMillionProjectionLimits,
): HalfMillionAgentProjection {
  const blockers: string[] = [];

  if (budget.agentCount < limits.targetAgentCount) {
    blockers.push(
      `agent count ${budget.agentCount} is below the ${limits.targetAgentCount} target`,
    );
  }

  if (budget.estimatedAgentMemoryMegabytes > limits.memoryBudgetMegabytes) {
    blockers.push(
      `estimated ${budget.estimatedAgentMemoryMegabytes} MB exceeds the ${limits.memoryBudgetMegabytes} MB budget`,
    );
  }

  return {
    blockers,
    estimatedAgentMemoryMegabytes: budget.estimatedAgentMemoryMegabytes,
    measurement: "not-measured",
    memoryBudgetMegabytes: limits.memoryBudgetMegabytes,
    projection: blockers.length === 0 ? "within-budget" : "over-budget",
    targetAgentCount: limits.targetAgentCount,
  };
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
    mode: "planned-drawIndirect" as const,
  };
}
