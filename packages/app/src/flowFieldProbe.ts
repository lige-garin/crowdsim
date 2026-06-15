import {
  createAgentSoA,
  createFlowFieldCpu,
  createSpatialHashGridLayout,
  sampleFlowFieldGpu,
  setAgentPosition,
} from "@crowdsim/core-gpu";

export type FlowFieldProbeResult = {
  status: "ready" | "unsupported" | "error";
  message: string;
  directions: number[];
};

export async function runFlowFieldProbe(): Promise<FlowFieldProbeResult> {
  if (!("gpu" in navigator) || !navigator.gpu) {
    return emptyFlowFieldResult("unsupported", "WebGPU unavailable");
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();

    if (!adapter) {
      return emptyFlowFieldResult("unsupported", "No WebGPU adapter");
    }

    const device = await adapter.requestDevice();
    const layout = createSpatialHashGridLayout({
      width: 5,
      height: 1,
      cellSize: 1,
    });
    const flowField = createFlowFieldCpu({
      layout,
      targetCell: 4,
    });
    const agents = createAgentSoA(3);

    setAgentPosition(agents, 0, 0.5, 0.5);
    setAgentPosition(agents, 1, 2.5, 0.5);
    setAgentPosition(agents, 2, 4.5, 0.5);

    const directions = await sampleFlowFieldGpu(device, agents, flowField);
    device.destroy();

    if (!closeArrays(directions, new Float32Array([1, 0, 1, 0, 0, 0]))) {
      return {
        status: "error",
        message: "Flow field readback mismatch",
        directions: Array.from(directions),
      };
    }

    return {
      status: "ready",
      message: "Flow field verified",
      directions: Array.from(directions),
    };
  } catch (error) {
    return emptyFlowFieldResult(
      "error",
      error instanceof Error ? error.message : "Flow field probe failed",
    );
  }
}

function closeArrays(
  left: Float32Array,
  right: Float32Array,
  epsilon = 0.0001,
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => Math.abs(value - right[index]) <= epsilon)
  );
}

function emptyFlowFieldResult(
  status: FlowFieldProbeResult["status"],
  message: string,
): FlowFieldProbeResult {
  return {
    status,
    message,
    directions: [],
  };
}
