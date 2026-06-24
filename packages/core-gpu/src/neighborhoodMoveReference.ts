import { buildSpatialHashGridCpu } from "./cpuGrid";
import {
  clampMagnitude,
  closestPointOnSegment,
  computeCellId,
  normalize2,
  validateSocialForceInputs,
} from "./mathUtils";
import type {
  AgentSoA,
  SocialForceParams,
  SocialForceStepResult,
  SpatialHashGridLayout,
  WallSegment,
} from "./types";

// CPU mirror of the GPU fused move (gpuSimCoreShaders.ts fused_move): identical to
// stepSocialForceCpu EXCEPT agent repulsion is gathered only from the sorted 3x3
// cell neighborhood (via buildSpatialHashGridCpu), exactly like the kernel. When
// agentRepulsionRange <= cellSize this is equivalent to the all-pairs step, because
// any agent outside the 3x3 neighborhood is > cellSize >= range away and
// contributes zero. This lets us prove the neighborhood restriction is lossless in
// Node; it does NOT verify the WGSL (still needs `pnpm test:webgpu`).
export function stepSocialForceNeighborhoodCpu(
  agents: AgentSoA,
  targetPositions: Float32Array,
  walls: WallSegment[],
  params: SocialForceParams,
  layout: SpatialHashGridLayout,
): SocialForceStepResult {
  validateSocialForceInputs(agents, targetPositions, params);
  if (params.agentRepulsionRange > layout.cellSize) {
    throw new Error(
      "agentRepulsionRange must be <= cellSize for the 3x3 neighborhood to be lossless",
    );
  }

  const grid = buildSpatialHashGridCpu(agents, layout);
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

    const cell = computeCellId(px, py, layout);
    const column = cell % layout.columns;
    const row = Math.floor(cell / layout.columns);

    for (let dr = -1; dr <= 1; dr++) {
      const nr = row + dr;
      if (nr < 0 || nr >= layout.rows) {
        continue;
      }
      for (let dc = -1; dc <= 1; dc++) {
        const nc = column + dc;
        if (nc < 0 || nc >= layout.columns) {
          continue;
        }
        const ncell = nr * layout.columns + nc;
        for (
          let slot = grid.cellOffsets[ncell];
          slot < grid.cellOffsets[ncell + 1];
          slot++
        ) {
          const other = grid.sortedAgentIds[slot];
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

  return { positions: nextPositions, velocities: nextVelocities };
}
