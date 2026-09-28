import type { WallSegment } from "@crowdsim/core-gpu";
import { agentsWithinDistance, splitExitedAgents } from "./crowdStepUtils";
import { constrainMovement, type SceneWorldBounds } from "../engine/sceneGeometry";
import type { SimulationAgent } from "../engine/simulationEngine";
import type { WallIndex } from "../engine/wallIndex";

/**
 * Moussaïd, Helbing & Theraulaz, "How simple rules determine pedestrian
 * behavior and crowd disasters", PNAS 108(17), 2011 — a comparison layer,
 * not this project's crowd model. See
 * `docs/adr/0014-moussaid-heuristic-comparison-layer.md` for why it exists
 * and what it does and does not do; the shape (standalone module, its own
 * benchmark harness, nothing wired into `simulationEngine.ts`) mirrors
 * ADR-0013's ORCA layer.
 *
 * The paper's own two rules: (1) among directions in the walker's field of
 * view, pick the one minimising the implied detour distance to the goal
 * (equation 1 — how far you could walk unobstructed that way, then
 * straight to the goal from there); (2) slow down when the chosen
 * direction does not have much room ahead. `fieldOfViewDegrees`,
 * `angleStepDegrees` and `maxSightMeters` are this project's own reasonable
 * readings of the paper, not values it states as exact — disclosed here
 * rather than presented as literature-precise.
 */
export const moussaidParameters = {
  /** Degrees of field of view, centred on the direction to the goal. */
  fieldOfViewDegrees: 170,
  /** Degrees between sampled candidate directions. */
  angleStepDegrees: 5,
  /** Nobody looks further than this for an opening, m. */
  maxSightMeters: 10,
  /** Seconds to relax toward the newly chosen desired velocity. */
  relaxationSeconds: 0.5,
} as const;

export type MoussaidParameters = typeof moussaidParameters;

type Vector2 = { x: number; y: number };
type Circle = { radius: number; x: number; y: number };

/**
 * The distance from `from` to the first thing blocking `direction` (a
 * neighbour's own body, combined with this walker's own radius, or a
 * wall), capped at `maxDistance`. Exact ray-vs-circle and ray-vs-segment
 * geometry, not a sampled search.
 */
export function visibleDistance(
  from: Vector2,
  ownRadius: number,
  direction: Vector2,
  neighbors: readonly Circle[],
  walls: readonly WallSegment[],
  maxDistance: number,
): number {
  let nearest = maxDistance;

  for (const other of neighbors) {
    const combinedRadius = ownRadius + other.radius;
    const ocx = from.x - other.x;
    const ocy = from.y - other.y;
    const b = direction.x * ocx + direction.y * ocy;
    const c = ocx * ocx + ocy * ocy - combinedRadius * combinedRadius;
    const discriminant = b * b - c;
    if (discriminant < 0) continue;
    const sqrtDiscriminant = Math.sqrt(discriminant);
    const tNear = -b - sqrtDiscriminant;
    const tFar = -b + sqrtDiscriminant;
    const t = tNear >= 0 ? tNear : tFar;
    if (t >= 0 && t < nearest) nearest = t;
  }

  for (const wall of walls) {
    const hit = rayVsSegment(from, direction, wall);
    if (hit !== null && hit < nearest) nearest = hit;
  }

  return nearest;
}

/** Ray-vs-segment intersection distance along the ray, or null if none within it. */
function rayVsSegment(
  origin: Vector2,
  direction: Vector2,
  wall: WallSegment,
): number | null {
  const sx = wall.x2 - wall.x1;
  const sy = wall.y2 - wall.y1;
  const denominator = direction.x * sy - direction.y * sx;
  if (Math.abs(denominator) < 1e-9) return null; // parallel

  const dx = wall.x1 - origin.x;
  const dy = wall.y1 - origin.y;
  const t = (dx * sy - dy * sx) / denominator;
  const u = (dx * direction.y - dy * direction.x) / denominator;

  if (t < 0 || u < 0 || u > 1) return null;
  return t;
}

/**
 * The paper's own direction choice (its equation 1): among candidate
 * directions across the field of view centred on the goal direction, the
 * one minimising the law-of-cosines distance "walk this way to the limit
 * of what's visible, then straight to the goal from there".
 */
export function chooseHeading(
  self: { position: Vector2; radius: number },
  neighbors: readonly Circle[],
  walls: readonly WallSegment[],
  goal: Vector2,
  params: MoussaidParameters,
): { direction: Vector2; visibleDistance: number } {
  const dGoalX = goal.x - self.position.x;
  const dGoalY = goal.y - self.position.y;
  const dGoal = Math.hypot(dGoalX, dGoalY);

  if (dGoal < 1e-6) {
    return { direction: { x: 0, y: 0 }, visibleDistance: 0 };
  }

  const goalAngle = Math.atan2(dGoalY, dGoalX);
  const halfFov = (params.fieldOfViewDegrees * Math.PI) / 180 / 2;
  const step = (params.angleStepDegrees * Math.PI) / 180;

  let bestScore = Infinity;
  let bestAngleOffset = 0;
  let bestVisible = 0;

  for (let offset = -halfFov; offset <= halfFov + 1e-9; offset += step) {
    const angle = goalAngle + offset;
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const sight = visibleDistance(
      self.position,
      self.radius,
      direction,
      neighbors,
      walls,
      params.maxSightMeters,
    );
    // Equation 1: the detour distance implied by walking `sight` this way,
    // then straight to the goal — law of cosines with the angle between
    // this direction and the goal direction being `offset` itself, since
    // angles here are already measured from the goal direction.
    const detour = Math.sqrt(
      dGoal * dGoal + sight * sight - 2 * dGoal * sight * Math.cos(offset),
    );
    if (detour < bestScore) {
      bestScore = detour;
      bestAngleOffset = offset;
      bestVisible = sight;
    }
  }

  const bestAngle = goalAngle + bestAngleOffset;
  return {
    direction: { x: Math.cos(bestAngle), y: Math.sin(bestAngle) },
    visibleDistance: bestVisible,
  };
}

/** The agents near `self`, as plain circles — the shape `chooseHeading` needs. */
function neighborCircles(
  self: SimulationAgent,
  agents: readonly SimulationAgent[],
  maxDistance: number,
): Circle[] {
  return agentsWithinDistance(self, agents, maxDistance).map(({ agent }) => ({
    radius: agent.radius ?? 0.23,
    x: agent.x,
    y: agent.y,
  }));
}

export type MoussaidStepInput = {
  agents: readonly SimulationAgent[];
  dtSeconds: number;
  meanSpeedMetersPerSecond: number;
  walls: WallIndex;
  world?: SceneWorldBounds;
  isExitBound: (agent: SimulationAgent) => boolean;
  exitRadius: (agent: SimulationAgent) => number;
};

/**
 * Pushes any pair still overlapping after everyone's own proposed move
 * apart, splitting the correction evenly between them, a few passes to
 * settle a whole tangle rather than just the worst single pair.
 *
 * The direction-choice rule picks each person's own heading from a
 * snapshot taken *before* anyone moves that step; at 150 people converging
 * on a 2.4 m gap, enough of them can choose overlapping paths in the same
 * step that, left alone, their bodies pass through each other — measured
 * directly building this module's own benchmark harness: centres up to
 * 0.5 m inside their combined radius at the bottleneck, and a specific
 * flow measurement three times Weidmann's own peak because of it. Social
 * force has its own contact push for exactly this, and ORCA's own linear
 * program makes it structurally impossible; this heuristic has neither,
 * so a discrete-time correction stands in for the continuous non-overlap
 * the paper's own model assumes. Three passes over 150 people does not
 * reach zero overlap under sustained pressure at the gap — the same
 * measurement afterward found a worst case of about 0.04 m, not 0 — but
 * it is a 12x reduction, not a claim of an exact fix.
 */
function separateOverlaps(
  positions: { radius: number; x: number; y: number }[],
  iterations = 3,
) {
  for (let iteration = 0; iteration < iterations; iteration++) {
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i];
        const b = positions[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = a.radius + b.radius;
        if (dist >= minDist) continue;

        const overlap = minDist - dist;
        const nx = dist > 1e-9 ? dx / dist : 1;
        const ny = dist > 1e-9 ? dy / dist : 0;
        a.x -= nx * overlap * 0.5;
        a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5;
        b.y += ny * overlap * 0.5;
      }
    }
  }
}

/**
 * One step under Moussaïd's heuristic: exit handling identical to
 * `stepCrowd`'s/`stepCrowdOrca`'s own, a chosen heading and a
 * visibility-limited desired speed relaxed toward over
 * `relaxationSeconds` (the same exponential-relaxation shape
 * `crowdMovement.ts`'s own social force uses for its own desired
 * velocity), `separateOverlaps` to resolve the interpenetration that
 * choosing headings from a shared snapshot can otherwise cause, and this
 * project's own wall clip for the final integrated position — see this
 * module's own doc comment and
 * `docs/adr/0014-moussaid-heuristic-comparison-layer.md`.
 */
export function stepCrowdMoussaid(input: MoussaidStepInput): {
  agents: SimulationAgent[];
  exitedCount: number;
} {
  const p = moussaidParameters;
  const dt = input.dtSeconds;
  const { exitedCount, remaining } = splitExitedAgents(
    input.agents,
    input.isExitBound,
    input.exitRadius,
  );

  const proposals = remaining.map((agent) => {
    const radius = agent.radius ?? 0.23;
    const speedFactor = agent.speedFactor ?? 1;
    const freeSpeed = input.meanSpeedMetersPerSecond * speedFactor;

    const neighbors = neighborCircles(agent, remaining, p.maxSightMeters);
    const nearbyWalls = input.walls.near(
      agent.x,
      agent.y,
      p.maxSightMeters,
    ) as readonly WallSegment[];
    const { direction, visibleDistance: sight } = chooseHeading(
      { position: { x: agent.x, y: agent.y }, radius },
      neighbors,
      nearbyWalls,
      { x: agent.targetX, y: agent.targetY },
      p,
    );

    const desiredSpeed = Math.min(freeSpeed, sight / p.relaxationSeconds);
    const desiredVx = direction.x * desiredSpeed;
    const desiredVy = direction.y * desiredSpeed;
    const relax = Math.min(1, dt / p.relaxationSeconds);
    const vx = agent.vx + (desiredVx - agent.vx) * relax;
    const vy = agent.vy + (desiredVy - agent.vy) * relax;

    return {
      agent,
      nearbyWalls,
      radius,
      vx,
      vy,
      x: agent.x + vx * dt,
      y: agent.y + vy * dt,
    };
  });

  separateOverlaps(proposals);

  const next = proposals.map(({ agent, nearbyWalls, vx, vy, x, y }) => {
    const constrained: { blocked: boolean; x: number; y: number } =
      nearbyWalls.length === 0
        ? { blocked: false, x, y }
        : constrainMovement(agent, { x, y }, nearbyWalls, input.world);

    return { ...agent, x: constrained.x, y: constrained.y, vx, vy };
  });

  return { agents: next, exitedCount };
}
