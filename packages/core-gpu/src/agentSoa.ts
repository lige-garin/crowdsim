import type { AgentSoA } from "./types";

export function createAgentSoA(capacity: number): AgentSoA {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new Error("Agent capacity must be a positive integer");
  }

  return {
    capacity,
    count: 0,
    positions: new Float32Array(capacity * 2),
    velocities: new Float32Array(capacity * 2),
    targetField: new Uint32Array(capacity),
    state: new Uint32Array(capacity),
    agentType: new Uint32Array(capacity),
    speed: new Float32Array(capacity),
    radius: new Float32Array(capacity),
    flags: new Uint32Array(capacity),
  };
}

export function setAgentPosition(
  agents: AgentSoA,
  index: number,
  x: number,
  y: number,
) {
  assertAgentIndex(agents, index);
  agents.positions[index * 2] = x;
  agents.positions[index * 2 + 1] = y;
  agents.count = Math.max(agents.count, index + 1);
}

export function setAgentVelocity(
  agents: AgentSoA,
  index: number,
  x: number,
  y: number,
) {
  assertAgentIndex(agents, index);
  agents.velocities[index * 2] = x;
  agents.velocities[index * 2 + 1] = y;
  agents.count = Math.max(agents.count, index + 1);
}

export function setAgentSpeed(agents: AgentSoA, index: number, speed: number) {
  assertAgentIndex(agents, index);
  agents.speed[index] = speed;
  agents.count = Math.max(agents.count, index + 1);
}

export function setAgentTargetField(
  agents: AgentSoA,
  index: number,
  targetField: number,
) {
  assertAgentIndex(agents, index);
  agents.targetField[index] = Math.max(0, Math.floor(targetField));
  agents.count = Math.max(agents.count, index + 1);
}

export function setAgentRadius(agents: AgentSoA, index: number, radius: number) {
  assertAgentIndex(agents, index);
  agents.radius[index] = radius;
  agents.count = Math.max(agents.count, index + 1);
}

function assertAgentIndex(agents: AgentSoA, index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= agents.capacity) {
    throw new Error(`Agent index ${index} is outside capacity ${agents.capacity}`);
  }
}
