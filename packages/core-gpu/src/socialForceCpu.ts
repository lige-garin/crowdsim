import {
  clampMagnitude,
  closestPointOnSegment,
  normalize2,
  validateSocialForceInputs,
} from "./mathUtils";
import type {
  AgentSoA,
  SocialForceParams,
  SocialForceStepResult,
  WallSegment,
} from "./types";

export function stepSocialForceCpu(
  agents: AgentSoA,
  targetPositions: Float32Array,
  walls: WallSegment[],
  params: SocialForceParams,
): SocialForceStepResult {
  validateSocialForceInputs(agents, targetPositions, params);

  const nextPositions = agents.positions.slice(0, agents.count * 2);
  const nextVelocities = agents.velocities.slice(0, agents.count * 2);

  for (let index = 0; index < agents.count; index++) {
    const px = agents.positions[index * 2];
    const py = agents.positions[index * 2 + 1];
    const vx = agents.velocities[index * 2];
    const vy = agents.velocities[index * 2 + 1];
    const targetX = targetPositions[index * 2];
    const targetY = targetPositions[index * 2 + 1];
    const desiredSpeed =
      agents.speed[index] > 0 ? agents.speed[index] : params.desiredSpeed;
    const desired = normalize2(targetX - px, targetY - py);
    let forceX = (desired.x * desiredSpeed - vx) / params.relaxationTime;
    let forceY = (desired.y * desiredSpeed - vy) / params.relaxationTime;

    for (let other = 0; other < agents.count; other++) {
      if (other === index) {
        continue;
      }

      const dx = px - agents.positions[other * 2];
      const dy = py - agents.positions[other * 2 + 1];
      const distance = Math.max(Math.hypot(dx, dy), 0.0001);

      if (distance < params.agentRepulsionRange) {
        const strength =
          params.agentRepulsionStrength *
          ((params.agentRepulsionRange - distance) / params.agentRepulsionRange);
        forceX += (dx / distance) * strength;
        forceY += (dy / distance) * strength;
      }
    }

    for (const wall of walls) {
      const closest = closestPointOnSegment(px, py, wall);
      const dx = px - closest.x;
      const dy = py - closest.y;
      const distance = Math.max(Math.hypot(dx, dy), 0.0001);

      if (distance < params.wallRepulsionRange) {
        const strength =
          params.wallRepulsionStrength *
          ((params.wallRepulsionRange - distance) / params.wallRepulsionRange);
        forceX += (dx / distance) * strength;
        forceY += (dy / distance) * strength;
      }
    }

    const unclampedVx = vx + forceX * params.dt;
    const unclampedVy = vy + forceY * params.dt;
    const clampedVelocity = clampMagnitude(unclampedVx, unclampedVy, params.maxSpeed);

    nextVelocities[index * 2] = clampedVelocity.x;
    nextVelocities[index * 2 + 1] = clampedVelocity.y;
    nextPositions[index * 2] = px + clampedVelocity.x * params.dt;
    nextPositions[index * 2 + 1] = py + clampedVelocity.y * params.dt;
  }

  return {
    positions: nextPositions,
    velocities: nextVelocities,
  };
}
