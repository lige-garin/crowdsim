import type { ScenePoint } from "@crowdsim/scene-schema";
import { sampleBodyRadius, sampleSpeedFactor } from "./behaviorDistributions";
import type { Router } from "./crowdNavigation";
import { constrainMovement, type SceneWorldBounds } from "./sceneGeometry";
import type { SimulationAgent } from "./simulationEngine";
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
};

export type SocialForceParameters = typeof socialForceParameters;

/** States in which a person stands at a spot rather than walking somewhere. */
const holdingStates = new Set(["browse", "enterStore", "queue"]);

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
  const next: SimulationAgent[] = [];
  let exitedCount = 0;

  for (const agent of agents) {
    const dx = agent.targetX - agent.x;
    const dy = agent.targetY - agent.y;
    const distance = Math.hypot(dx, dy);
    if (input.isExitBound(agent) && distance <= input.exitRadius(agent)) {
      exitedCount++;
      continue;
    }

    const radius = agent.radius ?? sampleBodyRadius(input.seed, agent.id);
    const speedFactor = agent.speedFactor ?? sampleSpeedFactor(input.seed, agent.id);
    const freeSpeed = input.meanSpeedMetersPerSecond * speedFactor;
    // Standing in a checkout line holds a slot like any other line.
    const holding =
      holdingStates.has(agent.lifecycleState ?? "") ||
      (agent.lifecycleState === "checkout" && agent.queueJoinedSeconds !== undefined);
    const heading: ScenePoint = holding
      ? distance > 1e-9
        ? { x: dx / distance, y: dy / distance }
        : { x: 0, y: 0 }
      : input.router.direction(agent, { x: agent.targetX, y: agent.targetY });

    let ax = 0;
    let ay = 0;
    forEachNearby(grid, agent.x, agent.y, (other) => {
      if (other.id === agent.id) return;
      let ox = agent.x - other.x;
      let oy = agent.y - other.y;
      let gap = Math.hypot(ox, oy);
      if (gap >= p.interactionRangeMeters) return;
      if (gap < 1e-6) {
        // Exactly stacked (a narrow gate can spawn two on one point): push
        // apart along an id-derived angle so the pair always separates.
        const angle = (agent.id * 2.399963) % (Math.PI * 2);
        ox = Math.cos(angle);
        oy = Math.sin(angle);
        gap = 0;
      } else {
        ox /= gap;
        oy /= gap;
      }
      const bodies = radius + (other.radius ?? sampleBodyRadius(input.seed, other.id));
      // cos φ between my heading and the direction to the other person.
      const facing = -(heading.x * ox + heading.y * oy);
      const weight = p.anisotropy + (1 - p.anisotropy) * ((1 + facing) / 2);
      let push =
        p.agentStrength * Math.exp((bodies - gap) / p.agentRangeMeters) * weight;
      if (gap < bodies) push += p.contactStiffness * (bodies - gap);
      ax += push * ox;
      ay += push * oy;
      if (facing > p.sidestepCone) {
        // Step to whichever side the other person is not on; dead ahead, always
        // the same side, so oncoming streams settle into lanes.
        const side = ox * heading.y - oy * heading.x;
        const away = side > 0.05 ? -1 : 1;
        ax += push * p.sidestep * away * -heading.y;
        ay += push * p.sidestep * away * heading.x;
      }
    });

    const nearbyWalls = input.walls.near(agent.x, agent.y, 1);
    for (const wall of nearbyWalls) {
      const closest = closestPointOnSegment(agent.x, agent.y, wall);
      const wx = agent.x - closest.x;
      const wy = agent.y - closest.y;
      const gap = Math.hypot(wx, wy);
      if (gap < 1e-9 || gap > 1) continue;
      let push = p.wallStrength * Math.exp((radius - gap) / p.wallRangeMeters);
      if (gap < radius) push += p.contactStiffness * (radius - gap);
      ax += (push * wx) / gap;
      ay += (push * wy) / gap;
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
    let speed = Math.hypot(vx, vy);
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
    const stepLength = Math.hypot(vx, vy) * dt;
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

    next.push({ ...agent, radius, speedFactor, vx, vy, x: resolved.x, y: resolved.y });
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
) {
  const column = Math.floor(x / buckets.size);
  const row = Math.floor(y / buckets.size);
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      const bucket = buckets.cells.get(bucketKey(column + dc, row + dr));
      if (!bucket) continue;
      for (const index of bucket) visit(buckets.agents[index]);
    }
  }
}
