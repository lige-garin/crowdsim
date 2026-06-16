import {
  createAgentSoA,
  setAgentPosition,
  setAgentSpeed,
  setAgentVelocity,
  type SocialForceParams,
  type WallSegment,
} from "@crowdsim/core-gpu";
import { constrainMovement, type SceneWorldBounds } from "./sceneGeometry";
import type { MovementBackend } from "./movementBackend";

type LiveMovementAgent = {
  id: number;
  targetSinkId?: string;
  targetX: number;
  targetY: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
};

type LiveMovementSink = {
  id: string;
  position: {
    x: number;
    y: number;
  };
  radius: number;
};

export type SimulationMovementStepInput<TAgent extends LiveMovementAgent> = {
  agents: readonly TAgent[];
  backend: MovementBackend;
  fixedDtSeconds: number;
  sinks: readonly LiveMovementSink[];
  speedMetersPerSecond: number;
  walls: readonly WallSegment[];
  world?: SceneWorldBounds;
};

export type SimulationMovementStepResult<TAgent extends LiveMovementAgent> = {
  agents: TAgent[];
  exitedCount: number;
};

export async function stepAgentsWithMovementBackend<TAgent extends LiveMovementAgent>({
  agents,
  backend,
  fixedDtSeconds,
  sinks,
  speedMetersPerSecond,
  walls,
  world,
}: SimulationMovementStepInput<TAgent>): Promise<SimulationMovementStepResult<TAgent>> {
  if (agents.length === 0) {
    return { agents: [], exitedCount: 0 };
  }

  const activeAgents: TAgent[] = [];
  let exitedCount = 0;

  for (const agent of agents) {
    if (isAgentAtSink(agent, sinks)) {
      exitedCount++;
    } else {
      activeAgents.push(agent);
    }
  }

  if (activeAgents.length === 0) {
    return { agents: [], exitedCount };
  }

  const soa = createAgentSoA(activeAgents.length);
  const targetPositions = new Float32Array(activeAgents.length * 2);

  activeAgents.forEach((agent, index) => {
    setAgentPosition(soa, index, agent.x, agent.y);
    setAgentVelocity(soa, index, agent.vx, agent.vy);
    setAgentSpeed(soa, index, speedMetersPerSecond);
    targetPositions[index * 2] = agent.targetX;
    targetPositions[index * 2 + 1] = agent.targetY;
  });

  const result = await backend.step({
    agents: soa,
    params: createLiveMovementParams(fixedDtSeconds, speedMetersPerSecond),
    targetPositions,
    walls: [...walls],
  });
  const nextAgents: TAgent[] = [];

  activeAgents.forEach((agent, index) => {
    const proposed = {
      x: result.positions[index * 2],
      y: result.positions[index * 2 + 1],
    };
    const resolved = constrainMovement(agent, proposed, walls, world);
    const movedAgent = {
      ...agent,
      vx: (resolved.x - agent.x) / fixedDtSeconds,
      vy: (resolved.y - agent.y) / fixedDtSeconds,
      x: resolved.x,
      y: resolved.y,
    };

    if (isAgentAtSink(movedAgent, sinks)) {
      exitedCount++;
      return;
    }

    nextAgents.push(movedAgent);
  });

  return { agents: nextAgents, exitedCount };
}

function createLiveMovementParams(
  fixedDtSeconds: number,
  speedMetersPerSecond: number,
): SocialForceParams {
  return {
    agentRepulsionRange: 1,
    agentRepulsionStrength: 2.4,
    desiredSpeed: speedMetersPerSecond,
    dt: fixedDtSeconds,
    maxSpeed: speedMetersPerSecond * 1.5,
    relaxationTime: 0.5,
    wallRepulsionRange: 0.8,
    wallRepulsionStrength: 1.8,
  };
}

function isAgentAtSink(agent: LiveMovementAgent, sinks: readonly LiveMovementSink[]) {
  const sink =
    sinks.find((candidate) => candidate.id === agent.targetSinkId) ??
    nearestSink(agent, sinks);

  if (!sink) {
    return false;
  }

  const dx = sink.position.x - agent.x;
  const dy = sink.position.y - agent.y;

  return Math.hypot(dx, dy) <= sink.radius;
}

function nearestSink(
  point: { x: number; y: number },
  sinks: readonly LiveMovementSink[],
) {
  let best = sinks[0];
  let bestDistanceSq = Number.POSITIVE_INFINITY;

  for (const sink of sinks) {
    const dx = sink.position.x - point.x;
    const dy = sink.position.y - point.y;
    const distanceSq = dx * dx + dy * dy;

    if (distanceSq < bestDistanceSq) {
      best = sink;
      bestDistanceSq = distanceSq;
    }
  }

  return best;
}
