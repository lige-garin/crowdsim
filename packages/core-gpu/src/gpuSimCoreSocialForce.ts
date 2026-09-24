import { buildSpatialHashGridCpu } from "./cpuGrid";
import {
  clampMagnitude,
  closestPointOnSegment,
  computeCellId,
  normalize2,
} from "./mathUtils";
import type {
  AgentSoA,
  SocialForceParams,
  SocialForceStepResult,
  SpatialHashGridLayout,
  WallSegment,
} from "./types";

/**
 * ADR-0015 stage 1: the resident GPU core's own social force, extended from
 * `socialForceCpu.ts`'s linear-falloff repulsion (still used, unmodified, by
 * `movementBackend.ts`'s CPU/GPU consistency probe -- deliberately left
 * alone, since changing its shape would break the very thing that probe
 * proves) to the exponential-falloff, anisotropic, contact-stiffness form
 * `crowdMovement.ts` actually runs in the app: `agentStrength *
 * exp((bodies - distance) / agentRangeMeters) * weight`, where `weight`
 * down-weights whoever is behind you (`anisotropy`) and a body-overlap term
 * (`contactStiffness`) keeps two people from truly occupying the same point.
 *
 * `agentRepulsionRange` keeps meaning what it always has for this package
 * (the exponential's own decay length, `crowdMovement`'s `agentRangeMeters`)
 * — the NEW `interactionRangeMeters` field is the hard cutoff beyond which
 * two people simply do not interact at all (`crowdMovement`'s own
 * `interactionRangeMeters`), a genuinely different number: with exponential
 * falloff the force is never exactly zero, unlike the old linear model where
 * `agentRepulsionRange` itself was that zero point. The 3x3 neighbourhood
 * grid this package's GPU core uses must cover that hard cutoff, so
 * `interactionRangeMeters <= cellSize` is the invariant now (asserted by
 * `stepForParity`/`createGpuSimCore`), not `agentRepulsionRange <= cellSize`.
 *
 * This file, `gpuSimCoreShaders.ts`'s `fused_move`, and
 * `test-webgpu/moveParity.webgpu.ts` are the three places this specific force
 * shape lives -- kept in sync by hand, verified against each other (the two
 * functions below against each other in Node; the neighbourhood version
 * against the WGSL kernel on real hardware), not derived from one shared
 * implementation (WGSL and TypeScript cannot share a function body).
 *
 * Deliberately NOT ported here, left for a later stage per ADR-0015's own
 * order (base force first, since everything else assumes it's right):
 * sidestep, anticipation (Karamouzas time-to-collision), group formation/
 * following, hazard avoidance, holding-state speed easing, the
 * no-walking-backward clamp, and the no-overshoot-past-target clamp. This is
 * the base relaxation + repulsion + wall force only.
 */
export type GpuSimCoreSocialForceParams = SocialForceParams & {
  /** Weight of people behind relative to people ahead, 0..1 (λ, crowdMovement's anisotropy). */
  anisotropy: number;
  /** Body compression when overlapping, 1/s² (k/m — crowdMovement's contactStiffness). */
  contactStiffness: number;
  /** Hard cutoff beyond which two people do not interact at all, m
   * (crowdMovement's interactionRangeMeters) — see this module's own doc
   * comment for why this differs from `agentRepulsionRange` now. */
  interactionRangeMeters: number;
};

function agentForce(
  desired: { x: number; y: number },
  bodies: number,
  dx: number,
  dy: number,
  params: GpuSimCoreSocialForceParams,
): { x: number; y: number } {
  const distance = Math.max(Math.hypot(dx, dy), 0.0001);
  if (distance >= params.interactionRangeMeters) {
    return { x: 0, y: 0 };
  }
  const nx = dx / distance;
  const ny = dy / distance;
  // -1 dead ahead of the walker's own desired heading, +1 dead behind.
  const facing = -(desired.x * nx + desired.y * ny);
  const weight = params.anisotropy + (1 - params.anisotropy) * ((1 + facing) / 2);
  let strength =
    params.agentRepulsionStrength *
    Math.exp((bodies - distance) / params.agentRepulsionRange) *
    weight;
  if (distance < bodies) {
    strength += params.contactStiffness * (bodies - distance);
  }
  return { x: nx * strength, y: ny * strength };
}

function wallForce(
  px: number,
  py: number,
  walls: WallSegment[],
  params: GpuSimCoreSocialForceParams,
): { x: number; y: number } {
  let forceX = 0;
  let forceY = 0;
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
  return { x: forceX, y: forceY };
}

function integrate(
  vx: number,
  vy: number,
  forceX: number,
  forceY: number,
  params: GpuSimCoreSocialForceParams,
): { position: { x: number; y: number }; velocity: { x: number; y: number } } {
  const unclampedVx = vx + forceX * params.dt;
  const unclampedVy = vy + forceY * params.dt;
  const clamped = clampMagnitude(unclampedVx, unclampedVy, params.maxSpeed);
  return {
    position: { x: clamped.x * params.dt, y: clamped.y * params.dt },
    velocity: clamped,
  };
}

/**
 * All-pairs (O(n²)) reference: the ground truth this file's own doc comment
 * describes. `stepGpuSimCoreSocialForceNeighborhoodCpu` below is checked
 * against this one in Node (`gpuSimCoreSocialForce.test.ts`) to prove the
 * neighbourhood restriction is lossless for the new force shape, the same
 * way `neighborhoodMoveReference.ts` already does for the linear-falloff
 * oracle.
 */
export function stepGpuSimCoreSocialForceCpu(
  agents: AgentSoA,
  targetPositions: Float32Array,
  walls: WallSegment[],
  params: GpuSimCoreSocialForceParams,
): SocialForceStepResult {
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
      const bodies = agents.radius[index] + agents.radius[other];
      const push = agentForce(desired, bodies, dx, dy, params);
      forceX += push.x;
      forceY += push.y;
    }

    const wall = wallForce(px, py, walls, params);
    forceX += wall.x;
    forceY += wall.y;

    const result = integrate(vx, vy, forceX, forceY, params);
    nextVelocities[index * 2] = result.velocity.x;
    nextVelocities[index * 2 + 1] = result.velocity.y;
    nextPositions[index * 2] = px + result.position.x;
    nextPositions[index * 2 + 1] = py + result.position.y;
  }

  return { positions: nextPositions, velocities: nextVelocities };
}

/**
 * CPU mirror of the GPU `fused_move` kernel (`gpuSimCoreShaders.ts`):
 * identical to `stepGpuSimCoreSocialForceCpu` above EXCEPT agent repulsion is
 * gathered only from the sorted 3x3 cell neighbourhood, exactly like the
 * kernel does. When `interactionRangeMeters <= layout.cellSize` this is
 * lossless versus the all-pairs step, because anyone outside the 3x3
 * neighbourhood is more than `cellSize >= interactionRangeMeters` away and
 * contributes exactly zero. Proves the neighbourhood restriction in Node; it
 * does NOT verify the WGSL itself (still needs `pnpm test:webgpu` on real
 * hardware, or the page-context harness this project uses when that
 * command self-skips).
 */
export function stepGpuSimCoreSocialForceNeighborhoodCpu(
  agents: AgentSoA,
  targetPositions: Float32Array,
  walls: WallSegment[],
  params: GpuSimCoreSocialForceParams,
  layout: SpatialHashGridLayout,
): SocialForceStepResult {
  if (params.interactionRangeMeters > layout.cellSize) {
    throw new Error(
      "interactionRangeMeters must be <= cellSize for the 3x3 neighborhood to be lossless",
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
          const bodies = agents.radius[index] + agents.radius[other];
          const push = agentForce(desired, bodies, dx, dy, params);
          forceX += push.x;
          forceY += push.y;
        }
      }
    }

    const wall = wallForce(px, py, walls, params);
    forceX += wall.x;
    forceY += wall.y;

    const result = integrate(vx, vy, forceX, forceY, params);
    nextVelocities[index * 2] = result.velocity.x;
    nextVelocities[index * 2 + 1] = result.velocity.y;
    nextPositions[index * 2] = px + result.position.x;
    nextPositions[index * 2 + 1] = py + result.position.y;
  }

  return { positions: nextPositions, velocities: nextVelocities };
}
