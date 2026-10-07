import type { ScenePoint } from "@crowdsim/scene-schema";
import { sampleBodyRadius, sampleSpeedFactor } from "./behaviorDistributions";
import type { Router } from "./crowdNavigation";
import { constrainMovement, type SceneWorldBounds } from "./sceneGeometry";
import type { SimulationAgent } from "./simulationEngine";
import { walkingGroupParameters, groupFormation } from "./walkingGroups";
import { closestPointOnSegment, type WallIndex } from "./wallIndex";

/**
 * How the crowd moves on the CPU path: a social-force model.
 *
 * Before this, every walker stepped straight toward its target at a scalar
 * speed and was then shoved out of anyone it overlapped. There was no inertia,
 * no looking ahead and no personal space, so direction changed instantly,
 * counterflow jittered instead of passing, and browsers and queuers were piled
 * on one point and pushed apart.
 *
 * Each person now has a velocity that relaxes toward where they want to go
 * (the router's direction at their own free speed), is pushed by people close
 * to them — more by those ahead than behind — and by nearby walls, and is capped
 * at 1.3× their free speed. Crowds slow down because of those pushes; there is
 * no separate density rule. Walls remain hard: a step that would cross one slides along it.
 *
 * HONESTY NOTE: the model form is Helbing & Molnár (1995) with the body
 * contact term of Helbing, Farkas & Vicsek (2000); there is no sliding-friction
 * term. τ, A, B and λ are fitted (2026-09-14, docs/calibration) so that, with no
 * explicit density slowdown, the speed–density relation the model produces in a
 * looped corridor matches Weidmann's curve: 0.08 m/s RMSE on densities, seeds
 * and a corridor width left out of the fit, 0.10 m/s against the SFPE corridor
 * formula, which was not fitted at all. That is a fit to a published curve, not
 * to trajectories, and the curve alone does not pin the parameters down — a
 * second, quite different set fits it about as well (see the report). The
 * remaining constants are hand-picked.
 */
export const socialForceParameters = {
  /** Seconds to reach the desired velocity (τ). Fitted. */
  relaxationSeconds: 0.644,
  /** Peak social push between two people, m/s² (A/m). Fitted. */
  agentStrength: 1.966,
  /** Fall-off length of that push, m (B). Fitted. */
  agentRangeMeters: 0.307,
  /** Weight of people behind relative to people ahead, 0..1 (λ). Fitted. */
  anisotropy: 0.287,
  /** Body compression when overlapping, 1/s² (k/m, 1.2e5 N/m over 80 kg). */
  contactStiffness: 1500,
  /** Push from a wall at contact, m/s². */
  wallStrength: 3,
  /** Fall-off length of the wall push, m. */
  wallRangeMeters: 0.2,
  /** Nobody is pushed faster than this multiple of their free speed. */
  maxSpeedRatio: 1.3,
  /** People further apart than this do not interact. */
  interactionRangeMeters: 2,
  /**
   * Share of the push from someone ahead that turns into a step sideways.
   * Without it two people on one line push only along that line, so a fast
   * walker is stuck behind a slow one and head-on pairs stall. Self-chosen.
   */
  sidestep: 0.6,
  /** Someone within this cosine of straight ahead triggers a sidestep (≈45°). */
  sidestepCone: 0.7,
  /** Someone holding a spot eases toward it over this distance. */
  holdEaseMeters: 1,
  /**
   * Anticipation: Karamouzas, Skinner & Guy (2014), "Universal power law
   * governing pedestrian interactions", Phys. Rev. Lett. 113, 238701. People
   * react to how soon they would collide at current velocities, not only to how
   * close others are: interaction energy k·τ⁻²·e^(−τ/τ₀). k and τ₀ are the
   * paper's values fitted to crowd data; 0 turns anticipation off.
   */
  anticipationStrength: 1.5,
  /** τ₀, s: collisions further away in time than a few of these are ignored. */
  anticipationHorizonSeconds: 3,
  /**
   * Only people this close are considered, m. Self-chosen, for cost: two people
   * walking at each other start adjusting about 2.9 m apart with the values above.
   */
  anticipationRangeMeters: 3,
  /** Cap on the anticipatory push, m/s². Self-chosen. */
  anticipationMaxAcceleration: 5,
};

export type SocialForceParameters = typeof socialForceParameters;

/** Closer than this, a wall or two strangers leave no room to walk abreast, m. Self-chosen. */
const formationRoomMeters = 1;

/** States in which a person stands at a spot rather than walking somewhere. */
const holdingStates = new Set(["browse", "enterStore", "queue"]);

/**
 * Whether this person stands at a spot rather than walking somewhere this
 * tick — standing in a checkout line holds a slot like any other line, and
 * so, in the sense that matters here (nobody is walked toward a target),
 * does someone incapacitated (ADR-0012): pinned where they went down.
 *
 * Extracted (ADR-0033) so the GPU wiring's per-agent upload arrays and this
 * file's own CPU step derive the exact same boolean from the exact same
 * rule, rather than one copying the other's logic by hand and risking drift.
 */
export function deriveHolding(agent: SimulationAgent): boolean {
  return (
    agent.incapacitated === true ||
    holdingStates.has(agent.lifecycleState ?? "") ||
    (agent.lifecycleState === "checkout" && agent.queueJoinedSeconds !== undefined)
  );
}

/**
 * This agent's free walking speed this tick, m/s: a stair or escalator has
 * its own literature speed (floorRouting), not a multiple of the scene's
 * level walking speed — floorTransfers sets `flightSpeedMetersPerSecond` when
 * someone boards a flight and clears it when they step off, so it never
 * leaks into their walk on a real floor. Fire/smoke exposure (ADR-0012,
 * simulationEngine's applyHazardExposure) then scales whatever that speed
 * is, on top of everything else.
 *
 * Extracted (ADR-0033) for the same reason as `deriveHolding`.
 */
export function deriveFreeSpeed(
  agent: SimulationAgent,
  meanSpeedMetersPerSecond: number,
  speedFactor: number,
): number {
  return (
    (agent.flightSpeedMetersPerSecond ?? meanSpeedMetersPerSecond * speedFactor) *
    (agent.smokeSpeedFactor ?? 1)
  );
}

/**
 * The unit direction this agent walks in this tick: straight at the target
 * while holding (a hold spot is never routed around obstacles — it is
 * reached directly or not stood at all), otherwise the router's
 * obstacle-aware direction, which only equals straight-line when there is
 * line of sight to the target (`crowdNavigation.ts`).
 *
 * Extracted (ADR-0033): this is the same value the GPU kernel's
 * `routedHeading` binding needs uploaded fresh every tick (a live engine
 * integration always has a real routed value to supply — see
 * `GpuSimCore.uploadRoutedHeading`'s own doc comment), computed by the exact
 * same rule this file's own CPU step already used inline.
 */
export function deriveWalkingHeading(
  agent: SimulationAgent,
  router: Pick<Router, "direction">,
  holding: boolean,
  dx: number,
  dy: number,
  distance: number,
): ScenePoint {
  if (holding) {
    return distance > 1e-9 ? { x: dx / distance, y: dy / distance } : { x: 0, y: 0 };
  }
  return router.direction(agent, { x: agent.targetX, y: agent.targetY });
}

export type CrowdStepInput = {
  agents: readonly SimulationAgent[];
  dtSeconds: number;
  /** The scene's mean free walking speed (weather already applied). */
  meanSpeedMetersPerSecond: number;
  router: Pick<Router, "direction">;
  /** Overrides for the model parameters (calibration). */
  parameters?: Partial<SocialForceParameters>;
  seed: number;
  walls: WallIndex;
  world?: SceneWorldBounds;
  /** Whether reaching the target removes this agent from the world. */
  isExitBound: (agent: SimulationAgent) => boolean;
  /** Arrival radius of the exit this agent is walking to. */
  exitRadius: (agent: SimulationAgent) => number;
  /**
   * Recompute the anticipatory push this step (default). When false, each
   * person keeps the push last computed for them: the engine replans it 20
   * times a simulated second, because scanning everyone within 3 m sixty times
   * a second more than doubled the cost of a step.
   */
  replanAnticipation?: boolean;
  /**
   * Filled with the exit each departing person was heading for, and **only
   * when supplied**. The engine passes a buffer during an evacuation and
   * nothing the rest of the time, so a normal step pays nothing for a figure
   * nobody looks at.
   */
  exitedSinkIds?: string[];
};

export function stepCrowd(input: CrowdStepInput): {
  agents: SimulationAgent[];
  exitedCount: number;
} {
  const p = input.parameters
    ? { ...socialForceParameters, ...input.parameters }
    : socialForceParameters;
  const dt = input.dtSeconds;
  const agents = input.agents;
  const grid = bucketAgents(agents, p.interactionRangeMeters);
  const formation = groupFormation(agents);
  // The gate covers the horizon, not just the strength. `anticipation()` divides
  // by `anticipationHorizonSeconds` twice (`exp(-tau/t0)` and `1/t0`), so a
  // horizon of 0 returns Infinity and 0·Infinity is NaN — and a NaN force lands
  // in an agent's position with nothing thrown and nothing logged, from there
  // on poisoning every neighbour it is compared against. `movementParameters`
  // reaches this line as an unvalidated `Partial<SocialForceParameters>` from
  // worker messages, the sensitivity screen and the Sobol sweep, so "0" and
  // "NaN" are reachable, not theoretical. A horizon that is not a positive
  // finite number turns anticipation off, exactly as a strength of 0 does:
  // the model is undefined there, and doing nothing is the honest reading of
  // it. `Number.isFinite` rather than `> 0` because NaN fails every comparison
  // and would otherwise pass the gate.
  const anticipating =
    p.anticipationStrength > 0 &&
    Number.isFinite(p.anticipationHorizonSeconds) &&
    p.anticipationHorizonSeconds > 0;
  const next: SimulationAgent[] = [];
  let exitedCount = 0;

  for (const agent of agents) {
    const dx = agent.targetX - agent.x;
    const dy = agent.targetY - agent.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (input.isExitBound(agent) && distance <= input.exitRadius(agent)) {
      exitedCount++;
      if (input.exitedSinkIds && agent.targetSinkId) {
        input.exitedSinkIds.push(agent.targetSinkId);
      }
      continue;
    }

    const radius = agent.radius ?? sampleBodyRadius(input.seed, agent.id);
    const speedFactor = agent.speedFactor ?? sampleSpeedFactor(input.seed, agent.id);
    const freeSpeed = deriveFreeSpeed(
      agent,
      input.meanSpeedMetersPerSecond,
      speedFactor,
    );
    const holding = deriveHolding(agent);
    const heading = deriveWalkingHeading(
      agent,
      input.router,
      holding,
      dx,
      dy,
      distance,
    );

    let ax = 0;
    let ay = 0;
    let strangersClose = 0;
    // Neighbour loop written out rather than going through forEachNearby:
    // this runs for every walker against everyone within reach, and passing a
    // closure meant a fresh function object per walker per step plus context
    // lookups for every field it reads. Inlining it measured 8% off a whole
    // engine step at a thousand people. The reader pays for that: the body
    // below is the social force, not a helper.
    {
      const gsize = grid.size;
      const gcol = Math.floor(agent.x / gsize);
      const grow = Math.floor(agent.y / gsize);
      const gcells = Math.ceil(p.interactionRangeMeters / gsize);
      for (let dc = -gcells; dc <= gcells; dc++) {
        for (let dr = -gcells; dr <= gcells; dr++) {
          const bucket = grid.cells.get(bucketKey(gcol + dc, grow + dr));
          if (!bucket) continue;
          for (let bi = 0; bi < bucket.length; bi++) {
            const other = grid.agents[bucket[bi]];
            if (other.id === agent.id) continue;
            let ox = agent.x - other.x;
            let oy = agent.y - other.y;
            let gap = Math.sqrt(ox * ox + oy * oy);
            if (gap >= p.interactionRangeMeters) continue;
            if (gap < formationRoomMeters && other.groupId !== agent.groupId)
              strangersClose++;
            if (gap < 1e-6) {
              const angle = (agent.id * 2.399963) % (Math.PI * 2);
              ox = Math.cos(angle);
              oy = Math.sin(angle);
              gap = 0;
            } else {
              ox /= gap;
              oy /= gap;
            }
            const bodies =
              radius + (other.radius ?? sampleBodyRadius(input.seed, other.id));
            const facing = -(heading.x * ox + heading.y * oy);
            const weight = p.anisotropy + (1 - p.anisotropy) * ((1 + facing) / 2);
            const together =
              agent.groupId !== undefined && agent.groupId === other.groupId;
            let push = together
              ? 0
              : p.agentStrength *
                Math.exp((bodies - gap) / p.agentRangeMeters) *
                weight;
            if (gap < bodies) push += p.contactStiffness * (bodies - gap);
            ax += push * ox;
            ay += push * oy;
            if (!together && facing > p.sidestepCone) {
              const side = ox * heading.y - oy * heading.x;
              const away = side > 0.05 ? -1 : 1;
              ax += push * p.sidestep * away * -heading.y;
              ay += push * p.sidestep * away * heading.x;
            }
          }
        }
      }
    }
    let avoidance: readonly [number, number] | undefined;
    if (anticipating && !holding) {
      avoidance =
        input.replanAnticipation === false && agent.avoidance
          ? agent.avoidance
          : anticipation(agent, radius, grid, p, input.seed);
      ax += avoidance[0];
      ay += avoidance[1];
    }

    // Steering away from fire/smoke (ADR-0012): computed once a tick for
    // everyone exposed (simulationEngine's applyHazardExposure), added in
    // here the same way the anticipation push above is.
    if (agent.hazardAvoidance && !holding) {
      ax += agent.hazardAvoidance[0];
      ay += agent.hazardAvoidance[1];
    }

    const nearbyWalls = input.walls.near(agent.x, agent.y, 1);
    let wallClose = false;
    for (const wall of nearbyWalls) {
      const closest = closestPointOnSegment(agent.x, agent.y, wall);
      const wx = agent.x - closest.x;
      const wy = agent.y - closest.y;
      const gap = Math.sqrt(wx * wx + wy * wy);
      if (gap < 1e-9 || gap > 1) continue;
      if (gap < formationRoomMeters) wallClose = true;
      let push = p.wallStrength * Math.exp((radius - gap) / p.wallRangeMeters);
      if (gap < radius) push += p.contactStiffness * (radius - gap);
      ax += (push * wx) / gap;
      ay += (push * wy) / gap;
    }

    // Walking with others: drift toward one's place beside them, and catch up
    // or wait when that place is ahead or behind. Only with room for it: in a
    // doorway or a crowd groups fall into file (Moussaïd et al. saw the line
    // bend as density rose); holding the line there jammed the demo's exit.
    const slot = formation.slots.get(agent.id);
    if (slot && !wallClose && strangersClose < 2) {
      ax += walkingGroupParameters.formationGain * (slot.x - agent.x);
      ay += walkingGroupParameters.formationGain * (slot.y - agent.y);
    }

    // People ease off as they arrive instead of overshooting the spot.
    const desiredSpeed = holding
      ? Math.min(freeSpeed, (freeSpeed * distance) / p.holdEaseMeters)
      : Math.min(freeSpeed, distance / p.relaxationSeconds);

    // Pushes first, then relax toward the desired velocity with the exact
    // exponential solution: unlike an explicit (v_des − v)/τ step it cannot
    // overshoot, whatever the step length.
    const relax = Math.exp(-dt / p.relaxationSeconds);
    let vx =
      heading.x * desiredSpeed +
      (agent.vx + ax * dt - heading.x * desiredSpeed) * relax;
    let vy =
      heading.y * desiredSpeed +
      (agent.vy + ay * dt - heading.y * desiredSpeed) * relax;
    // A walker squeezed by the crowd ahead stops; it does not walk backwards.
    // Forces from people in front outweigh those from behind (anisotropy), so
    // in a dense corridor the unclipped model drifted the whole crowd in
    // reverse. Sideways steps are untouched.
    if (!holding) {
      const along = vx * heading.x + vy * heading.y;
      if (along < 0) {
        vx -= along * heading.x;
        vy -= along * heading.y;
      }
    }
    let speed = Math.sqrt(vx * vx + vy * vy);
    const maxSpeed = freeSpeed * p.maxSpeedRatio;
    if (speed > maxSpeed) {
      vx *= maxSpeed / speed;
      vy *= maxSpeed / speed;
      speed = maxSpeed;
    }
    // Never walk past the target within one step.
    if (!holding && speed * dt > distance && speed > 0) {
      vx *= distance / (speed * dt);
      vy *= distance / (speed * dt);
    }

    const proposed = { x: agent.x + vx * dt, y: agent.y + vy * dt };
    // The hard wall check must see every wall the step could reach, not just
    // those close enough to push: a long step can jump past the push radius.
    const stepLength = Math.sqrt(vx * vx + vy * vy) * dt;
    const reachable =
      stepLength < 0.5
        ? nearbyWalls
        : input.walls.near(agent.x, agent.y, 1 + stepLength);
    const resolved = constrainMovement(agent, proposed, reachable, input.world);
    if (resolved.blocked || resolved.x !== proposed.x || resolved.y !== proposed.y) {
      // Whatever the wall (or world edge) took away is gone from the velocity too.
      vx = (resolved.x - agent.x) / dt;
      vy = (resolved.y - agent.y) / dt;
    }

    next.push({
      ...agent,
      avoidance,
      radius,
      speedFactor,
      vx,
      vy,
      x: resolved.x,
      y: resolved.y,
    });
  }

  return { agents: next, exitedCount };
}

type AgentBuckets = {
  agents: readonly SimulationAgent[];
  cells: Map<number, number[]>;
  size: number;
};

/**
 * Agents bucketed by position, built once per step from step-start positions,
 * so every force is computed against the same snapshot and the result does not
 * depend on the order agents are processed in.
 */
function bucketAgents(agents: readonly SimulationAgent[], size: number): AgentBuckets {
  const cells = new Map<number, number[]>();
  agents.forEach((agent, index) => {
    const key = bucketKey(Math.floor(agent.x / size), Math.floor(agent.y / size));
    const bucket = cells.get(key);
    if (bucket) bucket.push(index);
    else cells.set(key, [index]);
  });
  return { agents, cells, size };
}

function bucketKey(column: number, row: number) {
  return (column + 32768) * 65536 + (row + 32768);
}

function forEachNearby(
  buckets: AgentBuckets,
  x: number,
  y: number,
  visit: (agent: SimulationAgent) => void,
  reachMeters = buckets.size,
) {
  const column = Math.floor(x / buckets.size);
  const row = Math.floor(y / buckets.size);
  const cells = Math.ceil(reachMeters / buckets.size);
  for (let dc = -cells; dc <= cells; dc++) {
    for (let dr = -cells; dr <= cells; dr++) {
      const bucket = buckets.cells.get(bucketKey(column + dc, row + dr));
      if (!bucket) continue;
      for (const index of bucket) visit(buckets.agents[index]);
    }
  }
}

/**
 * The time-to-collision push (Karamouzas, Skinner & Guy 2014): for each person
 * on a collision course, τ is when the two bodies would touch if both kept
 * their velocities, and the push is minus the gradient of k·τ⁻²·e^(−τ/τ₀) with
 * respect to one's own velocity, as in the authors' reference implementation.
 * People already touching are left to the contact force.
 */
function anticipation(
  agent: SimulationAgent,
  radius: number,
  buckets: AgentBuckets,
  p: SocialForceParameters,
  seed: number,
): [number, number] {
  let fx = 0;
  let fy = 0;
  const k = p.anticipationStrength;
  const t0 = p.anticipationHorizonSeconds;
  const rangeSq = p.anticipationRangeMeters ** 2;
  const visit = (other: SimulationAgent) => {
    const wx = other.x - agent.x;
    const wy = other.y - agent.y;
    const distanceSq = wx * wx + wy * wy;
    if (distanceSq > rangeSq || other === agent) return;
    const vx = agent.vx - other.vx;
    const vy = agent.vy - other.vy;
    // Not closing in: no collision ahead.
    const b = wx * vx + wy * vy;
    if (b <= 0) return;
    const bodies = radius + (other.radius ?? sampleBodyRadius(seed, other.id));
    const c = distanceSq - bodies * bodies;
    if (c <= 0) return;
    const a = vx * vx + vy * vy;
    const discriminant = b * b - a * c;
    if (a < 1e-6 || discriminant <= 0) return;
    const root = Math.sqrt(discriminant);
    const tau = (b - root) / a;
    if (tau <= 0) return;
    const scale = (-k * Math.exp(-tau / t0) * (2 / tau + 1 / t0)) / (a * tau * tau);
    const px = scale * (vx - (b * vx - a * wx) / root);
    const py = scale * (vy - (b * vy - a * wy) / root);
    // Every guard above is a comparison, and a comparison against NaN is
    // always false — so a neighbour whose position or velocity is already NaN
    // walks through all of them and the NaN lands in `fx`/`fy` unchecked. It
    // would then spread to that agent's own neighbours on the next step, and
    // from there through the whole crowd, with nothing thrown and nothing
    // logged. One check on the result catches every path the guards miss,
    // including a non-finite `t0`, at the cost of two comparisons per
    // neighbour against a per-step cost of hundreds.
    if (!Number.isFinite(px) || !Number.isFinite(py)) return;
    fx += px;
    fy += py;
  };
  forEachNearby(buckets, agent.x, agent.y, visit, p.anticipationRangeMeters);

  // The cap is checked, not the sum. An earlier version of this guarded `fx`/`fy`
  // here, which does nothing for the case it was written for: the sum is finite
  // (47.68 in the test that caught it) and it is the *cap* that is NaN, so
  // `magnitude > cap` is false and the whole unclamped force goes through —
  // 9.5x the limit, enough to reverse two people walking head-on inside one
  // step. A cap that is not a positive number cannot express a limit, so the
  // push is dropped rather than applied unbounded.
  const cap = p.anticipationMaxAcceleration;

  if (!Number.isFinite(cap) || cap < 0) return [0, 0];

  const magnitude = Math.sqrt(fx * fx + fy * fy);
  if (magnitude > cap) {
    fx *= cap / magnitude;
    fy *= cap / magnitude;
  }
  return [fx, fy];
}
