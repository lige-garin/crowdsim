import {
  accumulateDensityCpu,
  accumulateDensityGpu,
  createAgentSoA,
  createSpatialHashGridLayout,
  setAgentPosition,
} from "@crowdsim/core-gpu";

export type HeatmapProbeResult = {
  status: "ready" | "unsupported" | "error";
  message: string;
  cellCounts: number[];
  maxCount: number;
};

export async function runHeatmapProbe(): Promise<HeatmapProbeResult> {
  if (!("gpu" in navigator) || !navigator.gpu) {
    return emptyHeatmapResult("unsupported", "WebGPU unavailable");
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();

    if (!adapter) {
      return emptyHeatmapResult("unsupported", "No WebGPU adapter");
    }

    const device = await adapter.requestDevice();
    const agents = createProbeAgents();
    const layout = createSpatialHashGridLayout({
      width: 20,
      height: 20,
      cellSize: 10,
    });
    const expected = accumulateDensityCpu(agents, layout);
    const actual = await accumulateDensityGpu(device, agents, layout);

    device.destroy();

    if (
      actual.maxCount !== expected.maxCount ||
      !arraysEqual(actual.cellCounts, expected.cellCounts)
    ) {
      return {
        status: "error",
        message: "Heatmap density readback mismatch",
        cellCounts: Array.from(actual.cellCounts),
        maxCount: actual.maxCount,
      };
    }

    return {
      status: "ready",
      message: "Heatmap density verified",
      cellCounts: Array.from(actual.cellCounts),
      maxCount: actual.maxCount,
    };
  } catch (error) {
    return emptyHeatmapResult(
      "error",
      error instanceof Error ? error.message : "Heatmap probe failed",
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

function emptyHeatmapResult(
  status: HeatmapProbeResult["status"],
  message: string,
): HeatmapProbeResult {
  return {
    status,
    message,
    cellCounts: [],
    maxCount: 0,
  };
}
