import { describe, expect, it } from "vitest";
import { computeOrcaVelocity, stepCrowdOrca } from "./orcaAvoidance";
import { createWallIndex } from "../wallIndex";
import type { SimulationAgent } from "../simulationEngine";

function agent(overrides: Partial<SimulationAgent> = {}): SimulationAgent {
  return {
    id: 1,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    targetX: 10,
    targetY: 0,
    radius: 0.25,
    speedFactor: 1,
    ...overrides,
  };
}

describe("computeOrcaVelocity", () => {
  it("returns the preferred velocity unchanged with nobody nearby", () => {
    const v = computeOrcaVelocity(
      { position: { x: 0, y: 0 }, radius: 0.25, velocity: { x: 0, y: 0 } },
      [],
      { x: 1.3, y: 0 },
      1.7,
    );

    expect(v.x).toBeCloseTo(1.3);
    expect(v.y).toBeCloseTo(0);
  });

  it("deflects two people approaching head-on, symmetrically", () => {
    // Close enough that they would collide well inside the 2 s time
    // horizon (3 m apart, closing at 2.6 m/s combined: ~1.15 s to contact)
    // — far enough apart and ORCA does not yet call for any evasion, since
    // nothing inside its own look-ahead window is actually at risk.
    const left = {
      position: { x: -1.5, y: 0 },
      radius: 0.25,
      velocity: { x: 1.3, y: 0 },
    };
    const right = {
      position: { x: 1.5, y: 0 },
      radius: 0.25,
      velocity: { x: -1.3, y: 0 },
    };

    const vLeft = computeOrcaVelocity(left, [right], { x: 1.3, y: 0 }, 1.7);
    const vRight = computeOrcaVelocity(right, [left], { x: -1.3, y: 0 }, 1.7);

    // Both still move roughly toward each other (forward progress kept)...
    expect(vLeft.x).toBeGreaterThan(0);
    expect(vRight.x).toBeLessThan(0);
    // ...but each picks up a sideways component to pass, and by the
    // reciprocal symmetry of a mirror-image pair, in opposite directions.
    expect(Math.abs(vLeft.y)).toBeGreaterThan(0.01);
    expect(vLeft.y).toBeCloseTo(-vRight.y, 5);
  });

  it("pushes an already-overlapping pair apart rather than freezing them", () => {
    // Centres 0.3 m apart with combined radius 0.5 m: already overlapping.
    const a = { position: { x: 0, y: 0 }, radius: 0.25, velocity: { x: 0, y: 0 } };
    const b = { position: { x: 0.3, y: 0 }, radius: 0.25, velocity: { x: 0, y: 0 } };

    const v = computeOrcaVelocity(a, [b], { x: 0, y: 0 }, 1.7);

    // Some nonzero escape velocity, not the zero preferred velocity verbatim.
    expect(v.x * v.x + v.y * v.y).toBeGreaterThan(0);
  });

  it("caps the solved velocity at the given max speed", () => {
    const v = computeOrcaVelocity(
      { position: { x: 0, y: 0 }, radius: 0.25, velocity: { x: 0, y: 0 } },
      [],
      { x: 10, y: 0 }, // an unreasonable preferred velocity
      1.7,
    );

    expect(Math.sqrt(v.x * v.x + v.y * v.y)).toBeLessThanOrEqual(1.7 + 1e-6);
  });
});

describe("stepCrowdOrca", () => {
  const noWalls = createWallIndex([]);

  it("moves a lone walker toward its target and exits it there", () => {
    // Already within the exit radius: the exit check runs before anyone
    // moves, so this is a one-step exit, not a multi-step walk.
    const a = agent({ x: 0, y: 0, targetX: 0.3, targetY: 0 });
    const { agents, exitedCount } = stepCrowdOrca({
      agents: [a],
      dtSeconds: 1 / 60,
      meanSpeedMetersPerSecond: 1.34,
      walls: noWalls,
      isExitBound: () => true,
      exitRadius: () => 0.5,
    });

    expect(exitedCount).toBe(1);
    expect(agents).toHaveLength(0);
  });

  it("keeps a head-on pair from ever overlapping past their combined radius", () => {
    let agents: SimulationAgent[] = [
      agent({ id: 1, x: -5, y: 0, targetX: 5, targetY: 0 }),
      agent({ id: 2, x: 5, y: 0, targetX: -5, targetY: 0 }),
    ];

    for (let step = 0; step < 60 * 8; step++) {
      const result = stepCrowdOrca({
        agents,
        dtSeconds: 1 / 60,
        meanSpeedMetersPerSecond: 1.34,
        walls: noWalls,
        isExitBound: () => false,
        exitRadius: () => 0,
      });
      agents = result.agents;
    }

    expect(agents).toHaveLength(2);
    const [a, b] = agents;
    const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    expect(dist).toBeGreaterThanOrEqual((a.radius! + b.radius!) * 0.95);
  });

  it("does not walk anyone through a wall", () => {
    const walls = createWallIndex([{ x1: 2, y1: -5, x2: 2, y2: 5 }]);
    let agents: SimulationAgent[] = [agent({ x: 0, y: 0, targetX: 10, targetY: 0 })];

    for (let step = 0; step < 60 * 5; step++) {
      const result = stepCrowdOrca({
        agents,
        dtSeconds: 1 / 60,
        meanSpeedMetersPerSecond: 1.34,
        walls,
        isExitBound: () => false,
        exitRadius: () => 0,
      });
      agents = result.agents;
    }

    expect(agents[0].x).toBeLessThan(2);
  });
});
