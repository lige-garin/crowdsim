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
 * As of stage 8, every ADR-0015 stage is ported here except
 * leader-following, which is a decision-layer target rewrite, not a 60Hz
 * force — nothing to port.
 *
 * Stage 2 adds ONE piece of group behaviour: the in-formation spring force
 * (`crowdMovement.ts`'s own `formationGain * (slot - agent)` pull toward a
 * side-by-side walking slot, gated by `!wallClose && strangersClose < 2`).
 * `groupFormation()` itself — computing each group's centroid, heading, and
 * per-member slot from the whole group every step — is a genuine group-level
 * reduction, architecturally different from the per-agent, per-neighbour
 * work this file's two functions already do; it stays CPU/JS-side and is
 * passed in as `formationSlots`, exactly the way pathfinding targets already
 * are (`targetPositions`) — a higher-level system's per-agent output, not
 * computed in-kernel. `groupId`/`formationGain`/`formationRoomMeters` are
 * NOT added to `GpuSimCoreSocialForceParams`: `crowdMovement.ts` itself
 * hardcodes `formationGain = 1` and `formationRoomMeters = 1` as plain
 * constants, not tunable calibration parameters (see `walkingGroups.ts`'s
 * `walkingGroupParameters.formationGain` and this file's own
 * `formationRoomMeters` below) — porting them as WGSL constants matches
 * that, rather than inventing configurability the CPU model doesn't have.
 */
const formationGain = 1;
const formationRoomMeters = 1;
export type GpuSimCoreSocialForceParams = SocialForceParams & {
  /** Weight of people behind relative to people ahead, 0..1 (λ, crowdMovement's anisotropy). */
  anisotropy: number;
  /** Body compression when overlapping, 1/s² (k/m — crowdMovement's contactStiffness). */
  contactStiffness: number;
  /** Hard cutoff beyond which two people do not interact at all, m
   * (crowdMovement's interactionRangeMeters) — see this module's own doc
   * comment for why this differs from `agentRepulsionRange` now. */
  interactionRangeMeters: number;
  /** Perpendicular nudge strength for someone roughly ahead, 0..1 (crowdMovement's
   * `sidestep`) — unlike `formationGain`/`formationRoomMeters`, this one IS a
   * calibrated `socialForceParameters` field (part of the six the Morris
   * sensitivity screen already names), so it lives in this params type rather
   * than as a hardcoded constant. */
  sidestep: number;
  /** Cosine-of-facing-angle threshold above which sidestep triggers, ≈45°
   * (crowdMovement's `sidestepCone`) — same reasoning as `sidestep`. */
  sidestepCone: number;
  /** Anticipation strength k in Karamouzas, Skinner & Guy (2014)'s
   * k·τ⁻²·e^(−τ/τ₀) interaction energy — crowdMovement's `anticipationStrength`,
   * another real calibrated field (0 turns anticipation off there; here it is
   * ported unconditionally, since a per-agent on/off switch belongs to
   * scene/behaviour configuration this module has never carried). */
  anticipationStrength: number;
  /** τ₀ in the same formula, s — crowdMovement's `anticipationHorizonSeconds`. */
  anticipationHorizonSeconds: number;
  /** Neighbour search radius for anticipation, m — crowdMovement's
   * `anticipationRangeMeters`. Independent of `interactionRangeMeters` (the
   * paper's own default, 3m, is LARGER than this module's own
   * `interactionRangeMeters` default of 2m), so it gets its own
   * `<= cellSize` invariant below rather than reusing the existing one. */
  anticipationRangeMeters: number;
  /** Cap on the anticipatory push's magnitude, m/s² — crowdMovement's
   * `anticipationMaxAcceleration`, applied to the summed anticipation force
   * only (not the combined total), exactly like the CPU original. */
  anticipationMaxAcceleration: number;
  /** How far out (m) a holding agent eases toward its own spot —
   * crowdMovement's `holdEaseMeters`, another real calibrated field. Stage 6
   * uses this for the desired-speed formula's holding branch. */
  holdEaseMeters: number;
  /** Per-agent speed cap as a multiple of that agent's own free speed —
   * crowdMovement's `maxSpeedRatio`. Stage 6 uses `freeSpeed * maxSpeedRatio`
   * as the real clamp, NOT the inherited `maxSpeed` field (kept only
   * because `SocialForceParams` is shared with the frozen linear-model
   * probe — `socialForceCpu.ts`/`motionGpu.ts` — that still uses it as a
   * flat clamp; this file's own stage-6 integration ignores it). */
  maxSpeedRatio: number;
};

/**
 * One neighbour's full contribution to the force sum: agent repulsion —
 * zeroed between group members, exactly like `crowdMovement.ts`'s own
 * `push = together ? 0 : ...` (the contact-overlap term still applies even
 * then, matching `if (gap < bodies) push += contactStiffness * ...` running
 * unconditionally right after) — plus, for anyone roughly ahead and not in
 * the same group, a perpendicular sidestep nudge using that same push
 * magnitude. Combined into one function (rather than `agentForce` +
 * a separate `sidestepForce`) because that is how `crowdMovement.ts` itself
 * computes them: one `push` scalar, reused for both the radial and the
 * perpendicular contribution in the same per-neighbour code block.
 *
 * `together` was NOT threaded through stage 1's original `agentForce` —
 * groups did not exist in this module yet at the time, so its absence
 * could not have mattered. Discovered and fixed here, while scoping stage
 * 3, rather than left as a latent parity gap between the group-repulsion
 * behaviour this module claims to port and what it was actually computing.
 */
function agentInteractionForce(
  desired: { x: number; y: number },
  bodies: number,
  dx: number,
  dy: number,
  together: boolean,
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
  let push = together
    ? 0
    : params.agentRepulsionStrength *
      Math.exp((bodies - distance) / params.agentRepulsionRange) *
      weight;
  if (distance < bodies) {
    push += params.contactStiffness * (bodies - distance);
  }
  let x = nx * push;
  let y = ny * push;
  if (!together && facing > params.sidestepCone) {
    // Which side the neighbour is on, relative to the walker's own heading
    // — a small dead zone (0.05) around dead-ahead avoids flip-flopping
    // which way to dodge when the sign of a near-zero cross product is
    // essentially noise.
    const side = nx * desired.y - ny * desired.x;
    const away = side > 0.05 ? -1 : 1;
    x += push * params.sidestep * away * -desired.y;
    y += push * params.sidestep * away * desired.x;
  }
  return { x, y };
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

/**
 * Whether any wall comes within `formationRoomMeters` — `crowdMovement.ts`'s
 * own `wallClose` flag, which gates the formation force off near a wall so
 * it never fights the (much stronger) wall push. A second, small loop over
 * `walls` rather than folding into `wallForce()` above: the CPU original
 * gates wallClose on a *different* radius (`formationRoomMeters`, 1m) than
 * the wall push itself (`wallRepulsionRange`, ~0.2m) — two different
 * questions ("is a wall nearby at all" vs. "close enough to push against"),
 * kept as two small functions rather than one doing both.
 */
function isNearAnyWall(px: number, py: number, walls: WallSegment[]): boolean {
  for (const wall of walls) {
    const closest = closestPointOnSegment(px, py, wall);
    const dx = px - closest.x;
    const dy = py - closest.y;
    const gap = Math.hypot(dx, dy);
    if (gap > 0.000001 && gap < formationRoomMeters) {
      return true;
    }
  }
  return false;
}

/**
 * `crowdMovement.ts`'s own formation spring: pull an agent toward its
 * group's side-by-side slot, unless a wall is close (the crowd falls into
 * file there) or two or more non-group "strangers" are within
 * `formationRoomMeters` (holding a formation in a dense crowd of people not
 * in it jams the very gap it is trying to walk through). `groupId < 0` is
 * the "not in a group" sentinel (mirrors WGSL's `i32`, which has no
 * `undefined`).
 */
function formationForce(
  index: number,
  px: number,
  py: number,
  strangersClose: number,
  wallClose: boolean,
  groupIds: Int32Array | undefined,
  formationSlots: Float32Array | undefined,
): { x: number; y: number } {
  if (!groupIds || !formationSlots || groupIds[index] < 0) {
    return { x: 0, y: 0 };
  }
  if (wallClose || strangersClose >= 2) {
    return { x: 0, y: 0 };
  }
  return {
    x: formationGain * (formationSlots[index * 2] - px),
    y: formationGain * (formationSlots[index * 2 + 1] - py),
  };
}

/**
 * One neighbour's contribution to the anticipation (time-to-collision) push
 * — `crowdMovement.ts`'s own `anticipation()`, ported per-pair rather than
 * per-agent since this module already structures every other force as a
 * per-neighbour contribution summed by the caller. τ is when the two
 * bodies' current-velocity paths would first touch; the push is (minus) the
 * velocity-gradient of k·τ⁻²·e^(−τ/τ₀), the paper's own interaction energy.
 * Not a subset of `agentInteractionForce`'s neighbour loop — it uses a
 * different range (`anticipationRangeMeters`, independent of
 * `interactionRangeMeters`) and a different geometric test (closing speed
 * and discriminant, not distance alone), so it is its own separate pass
 * over the same neighbourhood, exactly like `crowdMovement.ts` itself calls
 * `anticipation()` as a separate function after its own repulsion loop, not
 * fused into it.
 */
function anticipationPairForce(
  px: number,
  py: number,
  vx: number,
  vy: number,
  bodies: number,
  ox: number,
  oy: number,
  ovx: number,
  ovy: number,
  params: GpuSimCoreSocialForceParams,
): { x: number; y: number } {
  const wx = ox - px;
  const wy = oy - py;
  const distanceSq = wx * wx + wy * wy;
  if (distanceSq > params.anticipationRangeMeters ** 2) {
    return { x: 0, y: 0 };
  }
  const rvx = vx - ovx;
  const rvy = vy - ovy;
  // Not closing in: no collision ahead.
  const b = wx * rvx + wy * rvy;
  if (b <= 0) {
    return { x: 0, y: 0 };
  }
  const c = distanceSq - bodies * bodies;
  if (c <= 0) {
    return { x: 0, y: 0 };
  }
  const a = rvx * rvx + rvy * rvy;
  const discriminant = b * b - a * c;
  if (a < 1e-6 || discriminant <= 0) {
    return { x: 0, y: 0 };
  }
  const root = Math.sqrt(discriminant);
  const tau = (b - root) / a;
  if (tau <= 0) {
    return { x: 0, y: 0 };
  }
  const k = params.anticipationStrength;
  const t0 = params.anticipationHorizonSeconds;
  const scale = (-k * Math.exp(-tau / t0) * (2 / tau + 1 / t0)) / (a * tau * tau);
  return {
    x: scale * (rvx - (b * rvx - a * wx) / root),
    y: scale * (rvy - (b * rvy - a * wy) / root),
  };
}

/** Clamps the summed anticipation push to `anticipationMaxAcceleration` —
 * `crowdMovement.ts`'s own magnitude cap on the SUM, applied once after
 * every neighbour's contribution is added up, not per-neighbour. */
function clampAnticipation(
  fx: number,
  fy: number,
  params: GpuSimCoreSocialForceParams,
): { x: number; y: number } {
  const magnitude = Math.hypot(fx, fy);
  if (magnitude > params.anticipationMaxAcceleration) {
    const scale = params.anticipationMaxAcceleration / magnitude;
    return { x: fx * scale, y: fy * scale };
  }
  return { x: fx, y: fy };
}

/**
 * Stage 6: `crowdMovement.ts`'s own two-part integration, ported exactly —
 * NOT the naive `v += force * dt` stages 1-5 used for the relaxation term
 * (a real, deeper discrepancy discovered while scoping this stage, present
 * since stage 1 and not specific to holding at all: `desiredSpeed` itself
 * eases with distance-to-target — `min(freeSpeed, distance / relaxationTime)`
 * even for non-holding agents — a distance-based deceleration stages 1-5's
 * flat `desiredSpeed = freeSpeed` never had). Pushes (`ax`/`ay` — repulsion,
 * wall, sidestep, anticipation, formation, hazard avoidance; everything
 * EXCEPT relaxation toward the desired heading) are Euler-integrated into
 * velocity first, then relaxation is solved EXACTLY as a linear ODE from
 * that intermediate velocity — the closed-form `v(dt) = v_target + (v0 −
 * v_target) · e^(−dt/τ)`, which cannot overshoot the target velocity at any
 * step length, unlike an explicit `(v_target − v)/τ` force step would.
 *
 * `desiredSpeed`'s two branches (`holding ? ... : ...`) and the
 * `freeSpeed * maxSpeedRatio` clamp (replacing stages 1-5's flat
 * `params.maxSpeed`) are both computed by the caller and passed in here,
 * since both need `distance`/`freeSpeed`, already computed there for the
 * neighbour loop's own desired-direction/facing math.
 *
 * Stage 7: the no-walking-backward clamp, applied right after relaxation
 * and BEFORE the maxSpeedRatio clamp — exactly `crowdMovement.ts`'s own
 * order. A walker squeezed by the crowd ahead stops; it does not walk
 * backwards — forces from people in front outweigh those from behind
 * (anisotropy), so without this clamp a dense corridor's unclipped model
 * drifts the whole crowd in reverse. Only the component of velocity ALONG
 * the desired heading is zeroed when negative; the sideways component is
 * untouched, so a sidestep is never cancelled by this. Skipped for holding
 * agents, matching `crowdMovement.ts`'s own `if (!holding)` gate — a
 * holding agent's "heading" is just the direction to its own spot, and
 * walking "backward" relative to that has no meaning the CPU original
 * assigns a rule to either.
 *
 * Stage 8: never walk past the target within one step. Applied LAST, after
 * the maxSpeedRatio clamp — `crowdMovement.ts` scales velocity down using
 * the ALREADY-clamped speed so this can only shrink a step, never re-widen
 * one the speed clamp just shrank. Skipped for holding agents, matching
 * `crowdMovement.ts`'s own `if (!holding)` gate — a holding agent's target
 * distance is to its own hold spot, not a destination it should stop at.
 */
function integrateWithRelaxation(
  vx: number,
  vy: number,
  ax: number,
  ay: number,
  desired: { x: number; y: number },
  desiredSpeed: number,
  freeSpeed: number,
  distance: number,
  isHolding: boolean,
  params: GpuSimCoreSocialForceParams,
): { position: { x: number; y: number }; velocity: { x: number; y: number } } {
  const dt = params.dt;
  const relax = Math.exp(-dt / params.relaxationTime);
  const targetVx = desired.x * desiredSpeed;
  const targetVy = desired.y * desiredSpeed;
  let vxNew = targetVx + (vx + ax * dt - targetVx) * relax;
  let vyNew = targetVy + (vy + ay * dt - targetVy) * relax;
  if (!isHolding) {
    const along = vxNew * desired.x + vyNew * desired.y;
    if (along < 0) {
      vxNew -= along * desired.x;
      vyNew -= along * desired.y;
    }
  }
  const clamped = clampMagnitude(vxNew, vyNew, freeSpeed * params.maxSpeedRatio);
  vxNew = clamped.x;
  vyNew = clamped.y;
  const speed = Math.hypot(vxNew, vyNew);
  if (!isHolding && speed * dt > distance && speed > 0) {
    const overshootScale = distance / (speed * dt);
    vxNew *= overshootScale;
    vyNew *= overshootScale;
  }
  return {
    position: { x: vxNew * dt, y: vyNew * dt },
    velocity: { x: vxNew, y: vyNew },
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
  groupIds?: Int32Array,
  formationSlots?: Float32Array,
  hazardAvoidance?: Float32Array,
  holding?: Uint32Array,
  routedHeading?: Float32Array,
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
    const freeSpeed =
      agents.speed[index] > 0 ? agents.speed[index] : params.desiredSpeed;
    const dxTarget = targetX - px;
    const dyTarget = targetY - py;
    const distance = Math.hypot(dxTarget, dyTarget);
    // ADR-0033: defaults to the straight-line direction (what routing
    // degrades to with nothing to route around) when the caller doesn't
    // supply a pre-routed heading — every pre-ADR-0033 test exercises this
    // default and stays byte-for-byte unchanged.
    const desired = routedHeading
      ? { x: routedHeading[index * 2], y: routedHeading[index * 2 + 1] }
      : normalize2(dxTarget, dyTarget);
    const isHolding = holding !== undefined && holding[index] !== 0;
    const desiredSpeed = isHolding
      ? Math.min(freeSpeed, (freeSpeed * distance) / params.holdEaseMeters)
      : Math.min(freeSpeed, distance / params.relaxationTime);
    let ax = 0;
    let ay = 0;

    let strangersClose = 0;
    let anticipationX = 0;
    let anticipationY = 0;
    for (let other = 0; other < agents.count; other++) {
      if (other === index) {
        continue;
      }
      const dx = px - agents.positions[other * 2];
      const dy = py - agents.positions[other * 2 + 1];
      if (
        groupIds &&
        Math.hypot(dx, dy) < formationRoomMeters &&
        groupIds[other] !== groupIds[index]
      ) {
        strangersClose++;
      }
      const bodies = agents.radius[index] + agents.radius[other];
      const together =
        groupIds !== undefined &&
        groupIds[index] >= 0 &&
        groupIds[index] === groupIds[other];
      const push = agentInteractionForce(desired, bodies, dx, dy, together, params);
      ax += push.x;
      ay += push.y;
      const anticipate = anticipationPairForce(
        px,
        py,
        vx,
        vy,
        bodies,
        agents.positions[other * 2],
        agents.positions[other * 2 + 1],
        agents.velocities[other * 2],
        agents.velocities[other * 2 + 1],
        params,
      );
      anticipationX += anticipate.x;
      anticipationY += anticipate.y;
    }
    const anticipation = clampAnticipation(anticipationX, anticipationY, params);
    ax += anticipation.x;
    ay += anticipation.y;

    const wall = wallForce(px, py, walls, params);
    ax += wall.x;
    ay += wall.y;

    const formation = formationForce(
      index,
      px,
      py,
      strangersClose,
      isNearAnyWall(px, py, walls),
      groupIds,
      formationSlots,
    );
    ax += formation.x;
    ay += formation.y;

    // Hazard avoidance (ADR-0012): steer away from the worst fire/smoke
    // source exposing this agent. Precomputed once per DECISION tick by
    // `simulationEngine.ts`'s `hazardAvoidancePush` — a function of the
    // agent's own position, one hazard's position, and that agent's
    // exposure, with no other agent involved — and passed in exactly like
    // `formationSlots` already is: a higher-level system's per-agent
    // output, not a neighbour-summed force, so there is no loop here at
    // all, just an add.
    if (hazardAvoidance) {
      ax += hazardAvoidance[index * 2];
      ay += hazardAvoidance[index * 2 + 1];
    }

    const result = integrateWithRelaxation(
      vx,
      vy,
      ax,
      ay,
      desired,
      desiredSpeed,
      freeSpeed,
      distance,
      isHolding,
      params,
    );
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
  groupIds?: Int32Array,
  formationSlots?: Float32Array,
  hazardAvoidance?: Float32Array,
  holding?: Uint32Array,
  routedHeading?: Float32Array,
): SocialForceStepResult {
  if (params.interactionRangeMeters > layout.cellSize) {
    throw new Error(
      "interactionRangeMeters must be <= cellSize for the 3x3 neighborhood to be lossless",
    );
  }
  // strangersClose (the formation force's crowding gate) searches the same
  // 3x3 neighbourhood as agent repulsion, restricted to formationRoomMeters
  // instead of interactionRangeMeters — lossless only if that smaller
  // radius is ALSO covered by the neighbourhood, which the check above does
  // not guarantee on its own (a caller could set interactionRangeMeters
  // below formationRoomMeters). Only enforced when groups are actually in
  // play, since it is meaningless otherwise.
  if (groupIds && formationRoomMeters > layout.cellSize) {
    throw new Error(
      "formationRoomMeters must be <= cellSize for the 3x3 neighborhood to be lossless",
    );
  }
  // Anticipation searches the SAME 3x3 neighbourhood, restricted to its own
  // anticipationRangeMeters — independent of interactionRangeMeters (the
  // paper's own default, 3m, is larger than this module's interaction
  // default of 2m), so it needs its own invariant, not a reuse of the check
  // above. Always enforced (unlike the group-only formation check): every
  // caller pays the anticipation force, there is no "off" switch here.
  if (params.anticipationRangeMeters > layout.cellSize) {
    throw new Error(
      "anticipationRangeMeters must be <= cellSize for the 3x3 neighborhood to be lossless",
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
    const freeSpeed =
      agents.speed[index] > 0 ? agents.speed[index] : params.desiredSpeed;
    const dxTarget = targetX - px;
    const dyTarget = targetY - py;
    const distance = Math.hypot(dxTarget, dyTarget);
    // ADR-0033: defaults to the straight-line direction (what routing
    // degrades to with nothing to route around) when the caller doesn't
    // supply a pre-routed heading — every pre-ADR-0033 test exercises this
    // default and stays byte-for-byte unchanged.
    const desired = routedHeading
      ? { x: routedHeading[index * 2], y: routedHeading[index * 2 + 1] }
      : normalize2(dxTarget, dyTarget);
    const isHolding = holding !== undefined && holding[index] !== 0;
    const desiredSpeed = isHolding
      ? Math.min(freeSpeed, (freeSpeed * distance) / params.holdEaseMeters)
      : Math.min(freeSpeed, distance / params.relaxationTime);
    let ax = 0;
    let ay = 0;

    const cell = computeCellId(px, py, layout);
    const column = cell % layout.columns;
    const row = Math.floor(cell / layout.columns);

    let strangersClose = 0;
    let anticipationX = 0;
    let anticipationY = 0;
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
          if (
            groupIds &&
            Math.hypot(dx, dy) < formationRoomMeters &&
            groupIds[other] !== groupIds[index]
          ) {
            strangersClose++;
          }
          const bodies = agents.radius[index] + agents.radius[other];
          const together =
            groupIds !== undefined &&
            groupIds[index] >= 0 &&
            groupIds[index] === groupIds[other];
          const push = agentInteractionForce(desired, bodies, dx, dy, together, params);
          ax += push.x;
          ay += push.y;
          const anticipate = anticipationPairForce(
            px,
            py,
            vx,
            vy,
            bodies,
            agents.positions[other * 2],
            agents.positions[other * 2 + 1],
            agents.velocities[other * 2],
            agents.velocities[other * 2 + 1],
            params,
          );
          anticipationX += anticipate.x;
          anticipationY += anticipate.y;
        }
      }
    }
    const anticipation = clampAnticipation(anticipationX, anticipationY, params);
    ax += anticipation.x;
    ay += anticipation.y;

    const wall = wallForce(px, py, walls, params);
    ax += wall.x;
    ay += wall.y;

    const formation = formationForce(
      index,
      px,
      py,
      strangersClose,
      isNearAnyWall(px, py, walls),
      groupIds,
      formationSlots,
    );
    ax += formation.x;
    ay += formation.y;

    if (hazardAvoidance) {
      ax += hazardAvoidance[index * 2];
      ay += hazardAvoidance[index * 2 + 1];
    }

    const result = integrateWithRelaxation(
      vx,
      vy,
      ax,
      ay,
      desired,
      desiredSpeed,
      freeSpeed,
      distance,
      isHolding,
      params,
    );
    nextVelocities[index * 2] = result.velocity.x;
    nextVelocities[index * 2 + 1] = result.velocity.y;
    nextPositions[index * 2] = px + result.position.x;
    nextPositions[index * 2 + 1] = py + result.position.y;
  }

  return { positions: nextPositions, velocities: nextVelocities };
}
