import type { WallSegment } from "@crowdsim/core-gpu";
import { constrainMovement, type SceneWorldBounds } from "./sceneGeometry";
import type { SimulationAgent } from "./simulationEngine";
import type { WallIndex } from "./wallIndex";

/**
 * ORCA (Optimal Reciprocal Collision Avoidance): van den Berg, Guy, Lin &
 * Manocha, "Reciprocal n-Body Collision Avoidance", 2008 (and the RVO2
 * library that popularised it). A comparison layer, not this project's
 * crowd model — see `docs/adr/0013-orca-comparison-layer.md` for why it
 * exists, what it does and does not do, and where its own scope was cut.
 *
 * Not wired into `simulationEngine.ts`, the scene schema or the editor:
 * there is no in-app way to run a scene "on ORCA". `orcaComparison.ts` is
 * the only caller, producing a social-force-vs-ORCA difference table on
 * this project's own existing benchmarks.
 *
 * Parameters are the ORCA literature's own typical values, not fitted to
 * anything — unlike `socialForceParameters`, which is fitted
 * (`docs/calibration/`). Disclosed here rather than left to look like an
 * apples-to-apples calibrated comparison.
 */
export const orcaParameters = {
  /** Seconds of look-ahead for a pair not yet touching. RVO2's own default. */
  timeHorizon: 2,
  /** Only agents within this many metres are treated as neighbours. */
  neighborDistanceMeters: 5,
  /** At most this many nearest neighbours are considered, for cost. */
  maxNeighbors: 10,
  /** Nobody is asked to exceed this multiple of their own free speed. */
  maxSpeedRatio: 1.3,
} as const;

export type OrcaParameters = typeof orcaParameters;

type Vector2 = { x: number; y: number };

function sub(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x - b.x, y: a.y - b.y };
}
function add(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x + b.x, y: a.y + b.y };
}
function scale(a: Vector2, s: number): Vector2 {
  return { x: a.x * s, y: a.y * s };
}
function dot(a: Vector2, b: Vector2): number {
  return a.x * b.x + a.y * b.y;
}
/** The 2D "cross product" / determinant of two vectors (RVO2's `det`). */
function det(a: Vector2, b: Vector2): number {
  return a.x * b.y - a.y * b.x;
}
function lengthSq(a: Vector2): number {
  return a.x * a.x + a.y * a.y;
}
function length(a: Vector2): number {
  return Math.sqrt(lengthSq(a));
}
function normalize(a: Vector2): Vector2 {
  const len = length(a);
  return len > 1e-9 ? scale(a, 1 / len) : { x: 0, y: 0 };
}

/** A half-plane: acceptable velocities are those on the left of `point + t*direction`. */
type OrcaLine = { direction: Vector2; point: Vector2 };

const epsilon = 1e-5;

/**
 * The velocity on `lines[lineNo]` closest to `optVelocity` that also
 * satisfies every constraint before it in `lines`, and stays within the
 * disc of radius `radius`. Null when no such point exists — RVO2's
 * `linearProgram1`, minus its `directionOpt` mode (used only by RVO2's own
 * `linearProgram3`, the feasibility-relaxation fallback this module does
 * not implement — see `linearProgram2`'s own doc comment).
 */
function linearProgram1(
  lines: readonly OrcaLine[],
  lineNo: number,
  radius: number,
  optVelocity: Vector2,
): Vector2 | null {
  const line = lines[lineNo];
  const dotProduct = dot(line.point, line.direction);
  const discriminant = dotProduct * dotProduct + radius * radius - lengthSq(line.point);

  if (discriminant < 0) {
    return null; // the max-speed disc does not reach this line at all
  }

  const sqrtDiscriminant = Math.sqrt(discriminant);
  let tLeft = -dotProduct - sqrtDiscriminant;
  let tRight = -dotProduct + sqrtDiscriminant;

  for (let i = 0; i < lineNo; i++) {
    const denominator = det(line.direction, lines[i].direction);
    const numerator = det(lines[i].direction, sub(line.point, lines[i].point));

    if (Math.abs(denominator) <= epsilon) {
      if (numerator < 0) return null; // parallel and on the wrong side
      continue;
    }

    const t = numerator / denominator;
    if (denominator >= 0) {
      tRight = Math.min(tRight, t);
    } else {
      tLeft = Math.max(tLeft, t);
    }
    if (tLeft > tRight) return null;
  }

  const t = dot(line.direction, sub(optVelocity, line.point));
  const clamped = Math.max(tLeft, Math.min(tRight, t));
  return add(line.point, scale(line.direction, clamped));
}

/**
 * The velocity inside the disc of radius `radius` closest to `optVelocity`
 * that satisfies every line in `lines` — RVO2's `linearProgram2`. When some
 * line cannot be satisfied alongside the ones before it, returns the best
 * candidate found before that failure (`ok: false`): a deliberately simpler
 * fallback than RVO2's own `linearProgram3` (a full feasibility relaxation
 * over every line, weighted by distance) — disclosed in
 * `docs/adr/0013-orca-comparison-layer.md`. Infeasibility is rare outside
 * extreme overcrowding.
 *
 * When a line cannot be satisfied within the disc at all (the escape it
 * calls for exceeds `radius`, typically a deep overlap that cannot be
 * fully resolved within one timestep at a human walking speed), the
 * fallback below moves at the full disc radius *toward* that line's own
 * feasible side, rather than returning the unconstrained candidate found
 * before the failure unchanged. Returning it unchanged was tried first and
 * rejected: for two agents starting already overlapping with zero
 * velocity, it gave back zero — the ORCA analogue of the flight-lane
 * freeze `floorTransfers.ts` was fixed for earlier this session, agents
 * that need to move apart but silently do not.
 */
function linearProgram2(
  lines: readonly OrcaLine[],
  radius: number,
  optVelocity: Vector2,
): { ok: boolean; velocity: Vector2 } {
  let result =
    lengthSq(optVelocity) > radius * radius
      ? scale(normalize(optVelocity), radius)
      : optVelocity;

  for (let i = 0; i < lines.length; i++) {
    if (det(lines[i].direction, sub(lines[i].point, result)) > 0) {
      const candidate = linearProgram1(lines, i, radius, optVelocity);
      if (candidate === null) {
        // The escape normal: direction of steepest increase of
        // det(line.direction, x), the quantity that must grow to satisfy
        // this line — full speed that way is the best a disc of this
        // radius can offer toward resolving it.
        const escapeNormal = normalize({
          x: -lines[i].direction.y,
          y: lines[i].direction.x,
        });
        return { ok: false, velocity: scale(escapeNormal, radius) };
      }
      result = candidate;
    }
  }

  return { ok: true, velocity: result };
}

/**
 * One ORCA half-plane for `self` avoiding `other`, each taking half the
 * responsibility (the paper's reciprocal assumption). `timeStep` is used
 * only for a pair already overlapping (an escape line off the shorter
 * horizon), matching the paper's own two cases.
 */
function orcaLineFor(
  self: { position: Vector2; radius: number; velocity: Vector2 },
  other: { position: Vector2; radius: number; velocity: Vector2 },
  timeHorizon: number,
  timeStep: number,
): OrcaLine {
  const relativePosition = sub(other.position, self.position);
  const relativeVelocity = sub(self.velocity, other.velocity);
  const distSq = lengthSq(relativePosition);
  const combinedRadius = self.radius + other.radius;
  const combinedRadiusSq = combinedRadius * combinedRadius;

  let u: Vector2;
  let direction: Vector2;

  if (distSq > combinedRadiusSq) {
    const w = sub(relativeVelocity, scale(relativePosition, 1 / timeHorizon));
    const wLengthSq = lengthSq(w);
    const dotProduct1 = dot(w, relativePosition);

    if (dotProduct1 < 0 && dotProduct1 * dotProduct1 > combinedRadiusSq * wLengthSq) {
      // Relative velocity projects onto the cutoff circle, not a leg of the cone.
      const wLength = Math.sqrt(wLengthSq);
      const unitW = scale(w, 1 / wLength);
      direction = { x: unitW.y, y: -unitW.x };
      u = scale(unitW, combinedRadius / timeHorizon - wLength);
    } else {
      // Relative velocity projects onto a leg of the truncated cone.
      const leg = Math.sqrt(distSq - combinedRadiusSq);
      if (det(relativePosition, w) > 0) {
        direction = scale(
          {
            x: relativePosition.x * leg - relativePosition.y * combinedRadius,
            y: relativePosition.x * combinedRadius + relativePosition.y * leg,
          },
          1 / distSq,
        );
      } else {
        direction = scale(
          {
            x: -(relativePosition.x * leg + relativePosition.y * combinedRadius),
            y: -(-relativePosition.x * combinedRadius + relativePosition.y * leg),
          },
          1 / distSq,
        );
      }
      const dotProduct2 = dot(relativeVelocity, direction);
      u = sub(scale(direction, dotProduct2), relativeVelocity);
    }
  } else {
    // Already overlapping: escape along the shortest way out within one step.
    const invTimeStep = 1 / timeStep;
    const w = sub(relativeVelocity, scale(relativePosition, invTimeStep));
    const wLength = length(w);
    const unitW = wLength > 1e-9 ? scale(w, 1 / wLength) : { x: 0, y: 1 };
    direction = { x: unitW.y, y: -unitW.x };
    u = scale(unitW, combinedRadius * invTimeStep - wLength);
  }

  return { direction, point: add(self.velocity, scale(u, 0.5)) };
}

/**
 * The ORCA-optimal velocity for one agent: as close as possible to
 * `preferredVelocity`, subject to every neighbour's own half-plane
 * constraint, capped at `maxSpeed`.
 */
export function computeOrcaVelocity(
  self: { position: Vector2; radius: number; velocity: Vector2 },
  neighbors: readonly { position: Vector2; radius: number; velocity: Vector2 }[],
  preferredVelocity: Vector2,
  maxSpeed: number,
  timeHorizon: number = orcaParameters.timeHorizon,
  timeStep = 1 / 60,
): Vector2 {
  const lines = neighbors.map((other) =>
    orcaLineFor(self, other, timeHorizon, timeStep),
  );
  const solved = linearProgram2(lines, maxSpeed, preferredVelocity);
  return solved.velocity;
}

/** The `maxNeighbors` nearest agents within `neighborDistanceMeters`, nearest first. */
function nearestNeighbors(
  self: SimulationAgent,
  agents: readonly SimulationAgent[],
  params: OrcaParameters,
): SimulationAgent[] {
  const maxDistSq = params.neighborDistanceMeters * params.neighborDistanceMeters;
  return agents
    .filter((other) => other.id !== self.id)
    .map((other) => ({
      agent: other,
      distSq: (other.x - self.x) ** 2 + (other.y - self.y) ** 2,
    }))
    .filter((entry) => entry.distSq <= maxDistSq)
    .sort((a, b) => a.distSq - b.distSq)
    .slice(0, params.maxNeighbors)
    .map((entry) => entry.agent);
}

export type OrcaStepInput = {
  agents: readonly SimulationAgent[];
  dtSeconds: number;
  meanSpeedMetersPerSecond: number;
  walls: WallIndex;
  world?: SceneWorldBounds;
  isExitBound: (agent: SimulationAgent) => boolean;
  exitRadius: (agent: SimulationAgent) => number;
};

/**
 * One ORCA step: exit handling identical to `stepCrowd`'s own (an agent
 * within its exit radius of its target leaves), a preferred velocity
 * toward the target at the agent's own free speed (the same
 * `speedFactor`-scaled speed `stepCrowd` uses), ORCA for the avoidance
 * velocity, and this project's own wall clip (`constrainMovement`) for the
 * final integrated position — see this module's own doc comment and
 * `docs/adr/0013-orca-comparison-layer.md` for why walls are handled this
 * way rather than as ORCA obstacles.
 */
export function stepCrowdOrca(input: OrcaStepInput): {
  agents: SimulationAgent[];
  exitedCount: number;
} {
  const p = orcaParameters;
  const dt = input.dtSeconds;
  let exitedCount = 0;
  const remaining: SimulationAgent[] = [];

  for (const agent of input.agents) {
    const dx = agent.targetX - agent.x;
    const dy = agent.targetY - agent.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (input.isExitBound(agent) && distance <= input.exitRadius(agent)) {
      exitedCount++;
      continue;
    }
    remaining.push(agent);
  }

  const next = remaining.map((agent) => {
    const radius = agent.radius ?? 0.23;
    const speedFactor = agent.speedFactor ?? 1;
    const freeSpeed = input.meanSpeedMetersPerSecond * speedFactor;
    const maxSpeed = freeSpeed * p.maxSpeedRatio;

    const dx = agent.targetX - agent.x;
    const dy = agent.targetY - agent.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const preferred: Vector2 =
      distance > 1e-9
        ? scale(
            { x: dx / distance, y: dy / distance },
            Math.min(freeSpeed, distance / dt),
          )
        : { x: 0, y: 0 };

    const neighbors = nearestNeighbors(agent, remaining, p).map((other) => ({
      position: { x: other.x, y: other.y },
      radius: other.radius ?? 0.23,
      velocity: { x: other.vx, y: other.vy },
    }));

    const velocity = computeOrcaVelocity(
      {
        position: { x: agent.x, y: agent.y },
        radius,
        velocity: { x: agent.vx, y: agent.vy },
      },
      neighbors,
      preferred,
      maxSpeed,
      p.timeHorizon,
      dt,
    );

    const proposed = { x: agent.x + velocity.x * dt, y: agent.y + velocity.y * dt };
    const nearbyWalls = input.walls.near(agent.x, agent.y, 3);
    const constrained: { blocked: boolean; x: number; y: number } =
      nearbyWalls.length === 0
        ? { blocked: false, ...proposed }
        : constrainMovement(
            agent,
            proposed,
            nearbyWalls as readonly WallSegment[],
            input.world,
          );

    return {
      ...agent,
      x: constrained.x,
      y: constrained.y,
      vx: velocity.x,
      vy: velocity.y,
    };
  });

  return { agents: next, exitedCount };
}
