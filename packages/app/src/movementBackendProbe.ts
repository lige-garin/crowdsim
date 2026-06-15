import {
  createAgentSoA,
  setAgentPosition,
  setAgentVelocity,
  stepSocialForceCpu,
  stepSocialForceGpu,
  type SocialForceParams,
  type WallSegment,
} from "@crowdsim/core-gpu";

export type MovementBackendProbeResult = {
  activeBackend: "cpu-compat";
  message: string;
  positions: number[];
  readyBackend: "cpu-compat" | "webgpu-ready";
  status: "error" | "ready" | "unsupported";
  velocities: number[];
};

const targetPositions = new Float32Array([7, 1, 7, 1, 7, 1, 7, 1]);
const walls: WallSegment[] = [{ x1: 2.2, y1: -1, x2: 2.2, y2: 2 }];
const params: SocialForceParams = {
  agentRepulsionRange: 1,
  agentRepulsionStrength: 2.4,
  desiredSpeed: 1.35,
  dt: 1 / 30,
  maxSpeed: 2,
  relaxationTime: 0.5,
  wallRepulsionRange: 0.8,
  wallRepulsionStrength: 1.8,
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
    const agents = createMovementProbeAgents();
    const expected = stepSocialForceCpu(agents, targetPositions, walls, params);
    const actual = await stepSocialForceGpu(
      device,
      agents,
      targetPositions,
      walls,
      params,
    );

    device.destroy();

    if (
      !closeArrays(actual.positions, expected.positions) ||
      !closeArrays(actual.velocities, expected.velocities)
    ) {
      return {
        activeBackend: "cpu-compat",
        message: "WebGPU movement readback mismatch",
        positions: Array.from(actual.positions),
        readyBackend: "cpu-compat",
        status: "error",
        velocities: Array.from(actual.velocities),
      };
    }

    return {
      activeBackend: "cpu-compat",
      message: "WebGPU movement readback verified",
      positions: Array.from(actual.positions),
      readyBackend: "webgpu-ready",
      status: "ready",
      velocities: Array.from(actual.velocities),
    };
  } catch (error) {
    return emptyMovementResult(
      "error",
      error instanceof Error ? error.message : "WebGPU movement probe failed",
    );
  }
}

export function createMovementBackendSummary(result: MovementBackendProbeResult) {
  return [
    `active=${result.activeBackend}`,
    `ready=${result.readyBackend}`,
    `status=${result.status}`,
  ].join(" | ");
}

function createMovementProbeAgents() {
  const agents = createAgentSoA(4);

  setAgentPosition(agents, 0, 0, 0);
  setAgentPosition(agents, 1, 0.55, 0);
  setAgentPosition(agents, 2, 1.8, 0.35);
  setAgentPosition(agents, 3, 3.1, -0.2);
  setAgentVelocity(agents, 0, 0, 0);
  setAgentVelocity(agents, 1, 0, 0);
  setAgentVelocity(agents, 2, 0.1, 0);
  setAgentVelocity(agents, 3, 0, 0);

  return agents;
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
