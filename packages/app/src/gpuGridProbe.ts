import {
  buildSpatialHashGridCpu,
  buildSpatialHashGridGpu,
  createAgentSoA,
  createSpatialHashGridLayout,
  setAgentPosition,
} from "@crowdsim/core-gpu";

export type GpuGridProbeResult = {
  status: "ready" | "unsupported" | "error";
  message: string;
  cellIds: number[];
  cellCounts: number[];
  cellOffsets: number[];
  sortedAgentIds: number[];
};

export async function runGpuGridProbe(): Promise<GpuGridProbeResult> {
  if (!("gpu" in navigator) || !navigator.gpu) {
    return emptyGridResult("unsupported", "WebGPU unavailable");
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();

    if (!adapter) {
      return emptyGridResult("unsupported", "No WebGPU adapter");
    }

    const device = await adapter.requestDevice();
    const agents = createProbeAgents();
    const layout = createSpatialHashGridLayout({
      width: 20,
      height: 20,
      cellSize: 10,
    });
    const expected = buildSpatialHashGridCpu(agents, layout);
    const actual = await buildSpatialHashGridGpu(device, agents, layout);

    device.destroy();

    if (
      !arraysEqual(actual.cellIds, expected.cellIds) ||
      !arraysEqual(actual.cellCounts, expected.cellCounts) ||
      !arraysEqual(actual.cellOffsets, expected.cellOffsets) ||
      !arraysEqual(actual.sortedAgentIds, expected.sortedAgentIds)
    ) {
      return {
        status: "error",
        message: "GPU grid readback mismatch",
        cellIds: Array.from(actual.cellIds),
        cellCounts: Array.from(actual.cellCounts),
        cellOffsets: Array.from(actual.cellOffsets),
        sortedAgentIds: Array.from(actual.sortedAgentIds),
      };
    }

    return {
      status: "ready",
      message: "Grid readback verified",
      cellIds: Array.from(actual.cellIds),
      cellCounts: Array.from(actual.cellCounts),
      cellOffsets: Array.from(actual.cellOffsets),
      sortedAgentIds: Array.from(actual.sortedAgentIds),
    };
  } catch (error) {
    return emptyGridResult(
      "error",
      error instanceof Error ? error.message : "GPU grid probe failed",
    );
  }
}

function createProbeAgents() {
  const agents = createAgentSoA(4);

  setAgentPosition(agents, 0, 1, 1);
  setAgentPosition(agents, 1, 11, 1);
  setAgentPosition(agents, 2, 2, 9);
  setAgentPosition(agents, 3, 19, 18);

  return agents;
}

function arraysEqual(left: Uint32Array, right: Uint32Array): boolean {
  return (
    left.length === right.length && left.every((value, index) => value === right[index])
  );
}

function emptyGridResult(
  status: GpuGridProbeResult["status"],
  message: string,
): GpuGridProbeResult {
  return {
    status,
    message,
    cellIds: [],
    cellCounts: [],
    cellOffsets: [],
    sortedAgentIds: [],
  };
}
