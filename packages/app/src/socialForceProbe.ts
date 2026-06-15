import {
  createAgentSoA,
  setAgentPosition,
  setAgentVelocity,
  stepSocialForceCpu,
  stepSocialForceGpu,
  type SocialForceParams,
  type WallSegment,
} from "@crowdsim/core-gpu";

export type SocialForceProbeResult = {
  status: "ready" | "unsupported" | "error";
  message: string;
  positions: number[];
  velocities: number[];
};

const targetPositions = new Float32Array([6, 0, 6, 0, 6, 0]);
const walls: WallSegment[] = [{ x1: 1.2, y1: -1, x2: 1.2, y2: 1 }];
const params: SocialForceParams = {
  dt: 0.1,
  desiredSpeed: 1.4,
  relaxationTime: 0.5,
  agentRepulsionStrength: 2.2,
  agentRepulsionRange: 1,
  wallRepulsionStrength: 1.8,
  wallRepulsionRange: 0.8,
  maxSpeed: 2,
};

export async function runSocialForceProbe(): Promise<SocialForceProbeResult> {
  if (!("gpu" in navigator) || !navigator.gpu) {
    return emptySocialForceResult("unsupported", "WebGPU unavailable");
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();

    if (!adapter) {
      return emptySocialForceResult("unsupported", "No WebGPU adapter");
    }

    const device = await adapter.requestDevice();
    const agents = createProbeAgents();
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
        status: "error",
        message: "Social force readback mismatch",
        positions: Array.from(actual.positions),
        velocities: Array.from(actual.velocities),
      };
    }

    return {
      status: "ready",
      message: "Social force verified",
      positions: Array.from(actual.positions),
      velocities: Array.from(actual.velocities),
    };
  } catch (error) {
    return emptySocialForceResult(
      "error",
      error instanceof Error ? error.message : "Social force probe failed",
    );
  }
}

function createProbeAgents() {
  const agents = createAgentSoA(3);

  setAgentPosition(agents, 0, 0, 0);
  setAgentPosition(agents, 1, 0.5, 0);
  setAgentPosition(agents, 2, 2, 0.2);
  setAgentVelocity(agents, 0, 0, 0);
  setAgentVelocity(agents, 1, 0, 0);
  setAgentVelocity(agents, 2, 0, 0);

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

function emptySocialForceResult(
  status: SocialForceProbeResult["status"],
  message: string,
): SocialForceProbeResult {
  return {
    status,
    message,
    positions: [],
    velocities: [],
  };
}
