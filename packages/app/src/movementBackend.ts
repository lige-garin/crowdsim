import {
  createAgentSoA,
  setAgentPosition,
  setAgentVelocity,
  stepSocialForceCpu,
  stepSocialForceGpu,
  type AgentSoA,
  type SocialForceParams,
  type SocialForceStepResult,
  type WallSegment,
} from "@crowdsim/core-gpu";

export type MovementBackendId = "cpu-compat" | "webgpu-ready";

export type MovementBackendStepInput = {
  agents: AgentSoA;
  params: SocialForceParams;
  targetPositions: Float32Array;
  walls: WallSegment[];
};

export type MovementBackend = {
  id: MovementBackendId;
  mode: "active" | "ready";
  step: (input: MovementBackendStepInput) => Promise<SocialForceStepResult>;
};

export type MovementBackendAlignment = {
  matches: boolean;
  positionsDelta: number;
  velocitiesDelta: number;
};

export type MovementBackendProbeFixture = MovementBackendStepInput;

const probeTargetPositions = new Float32Array([7, 1, 7, 1, 7, 1, 7, 1]);
const probeWalls: WallSegment[] = [{ x1: 2.2, y1: -1, x2: 2.2, y2: 2 }];
const probeParams: SocialForceParams = {
  agentRepulsionRange: 1,
  agentRepulsionStrength: 2.4,
  desiredSpeed: 1.35,
  dt: 1 / 30,
  maxSpeed: 2,
  relaxationTime: 0.5,
  wallRepulsionRange: 0.8,
  wallRepulsionStrength: 1.8,
};

export function createCpuMovementBackend(): MovementBackend {
  return {
    id: "cpu-compat",
    mode: "active",
    step: async ({ agents, params, targetPositions, walls }) =>
      stepSocialForceCpu(agents, targetPositions, walls, params),
  };
}

export function createWebGpuMovementBackend(
  device: GPUDevice,
  mode: MovementBackend["mode"] = "ready",
): MovementBackend {
  return {
    id: "webgpu-ready",
    mode,
    step: ({ agents, params, targetPositions, walls }) =>
      stepSocialForceGpu(device, agents, targetPositions, walls, params),
  };
}

export function createMovementBackendProbeFixture(): MovementBackendProbeFixture {
  const agents = createAgentSoA(4);

  setAgentPosition(agents, 0, 0, 0);
  setAgentPosition(agents, 1, 0.55, 0);
  setAgentPosition(agents, 2, 1.8, 0.35);
  setAgentPosition(agents, 3, 3.1, -0.2);
  setAgentVelocity(agents, 0, 0, 0);
  setAgentVelocity(agents, 1, 0, 0);
  setAgentVelocity(agents, 2, 0.1, 0);
  setAgentVelocity(agents, 3, 0, 0);

  return {
    agents,
    params: { ...probeParams },
    targetPositions: new Float32Array(probeTargetPositions),
    walls: probeWalls.map((wall) => ({ ...wall })),
  };
}

export async function compareMovementBackends(
  referenceBackend: MovementBackend,
  candidateBackend: MovementBackend,
  fixture: MovementBackendProbeFixture,
  epsilon = 0.0001,
): Promise<MovementBackendAlignment & { candidate: SocialForceStepResult }> {
  const reference = await referenceBackend.step(fixture);
  const candidate = await candidateBackend.step(fixture);
  const positionsDelta = maxAbsDelta(candidate.positions, reference.positions);
  const velocitiesDelta = maxAbsDelta(candidate.velocities, reference.velocities);

  return {
    candidate,
    matches: positionsDelta <= epsilon && velocitiesDelta <= epsilon,
    positionsDelta,
    velocitiesDelta,
  };
}

export function createMovementBackendReadinessSummary(options: {
  activeBackend: MovementBackendId;
  readyBackend: MovementBackendId;
  status: "error" | "ready" | "unsupported";
}) {
  return [
    `active=${options.activeBackend}`,
    `ready=${options.readyBackend}`,
    `status=${options.status}`,
  ].join(" | ");
}

function maxAbsDelta(left: Float32Array, right: Float32Array) {
  if (left.length !== right.length) {
    return Number.POSITIVE_INFINITY;
  }

  return left.reduce(
    (delta, value, index) => Math.max(delta, Math.abs(value - right[index])),
    0,
  );
}
