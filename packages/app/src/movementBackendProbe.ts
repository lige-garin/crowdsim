import {
  compareMovementBackends,
  createCpuMovementBackend,
  createMovementBackendProbeFixture,
  createMovementBackendReadinessSummary,
  createWebGpuMovementBackend,
} from "./engine/movementBackend";

export type MovementBackendProbeResult = {
  activeBackend: "cpu-compat";
  message: string;
  positions: number[];
  readyBackend: "cpu-compat" | "webgpu-ready";
  status: "error" | "ready" | "unsupported";
  velocities: number[];
};

export async function runMovementBackendProbe(): Promise<MovementBackendProbeResult> {
  if (!("gpu" in navigator) || !navigator.gpu) {
    return emptyMovementResult("unsupported", "WebGPU movement backend unavailable");
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();

    if (!adapter) {
      return emptyMovementResult("unsupported", "No WebGPU movement adapter");
    }

    const device = await adapter.requestDevice();
    const alignment = await compareMovementBackends(
      createCpuMovementBackend(),
      createWebGpuMovementBackend(device),
      createMovementBackendProbeFixture(),
    );

    device.destroy();

    if (!alignment.matches) {
      return {
        activeBackend: "cpu-compat",
        message: `WebGPU movement readback mismatch p=${alignment.positionsDelta.toFixed(6)} v=${alignment.velocitiesDelta.toFixed(6)}`,
        positions: Array.from(alignment.candidate.positions),
        readyBackend: "cpu-compat",
        status: "error",
        velocities: Array.from(alignment.candidate.velocities),
      };
    }

    return {
      activeBackend: "cpu-compat",
      message: "WebGPU movement readback verified",
      positions: Array.from(alignment.candidate.positions),
      readyBackend: "webgpu-ready",
      status: "ready",
      velocities: Array.from(alignment.candidate.velocities),
    };
  } catch (error) {
    return emptyMovementResult(
      "error",
      error instanceof Error ? error.message : "WebGPU movement probe failed",
    );
  }
}

export function createMovementBackendSummary(result: MovementBackendProbeResult) {
  return createMovementBackendReadinessSummary(result);
}

function emptyMovementResult(
  status: MovementBackendProbeResult["status"],
  message: string,
): MovementBackendProbeResult {
  return {
    activeBackend: "cpu-compat",
    message,
    positions: [],
    readyBackend: "cpu-compat",
    status,
    velocities: [],
  };
}
