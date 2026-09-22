import { describe, expect, it } from "vitest";
import {
  chooseHeading,
  moussaidParameters,
  stepCrowdMoussaid,
  visibleDistance,
} from "./moussaidHeuristic";
import { createWallIndex } from "./wallIndex";
import type { SimulationAgent } from "./simulationEngine";

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

describe("visibleDistance", () => {
  it("reports the sight cap on a clear line", () => {
    const d = visibleDistance({ x: 0, y: 0 }, 0.25, { x: 1, y: 0 }, [], [], 10);
    expect(d).toBe(10);
  });

  it("stops at a neighbour's own combined radius, not their centre", () => {
    const d = visibleDistance(
      { x: 0, y: 0 },
      0.25,
      { x: 1, y: 0 },
      [{ x: 5, y: 0, radius: 0.25 }],
      [],
      10,
    );
    expect(d).toBeCloseTo(5 - 0.5, 5); // 5 m to centre, minus the combined 0.5 m radius
  });

  it("stops at a wall it crosses", () => {
    const d = visibleDistance(
      { x: 0, y: 0 },
      0.25,
      { x: 1, y: 0 },
      [],
      [{ x1: 4, y1: -2, x2: 4, y2: 2 }],
      10,
    );
    expect(d).toBeCloseTo(4, 5);
  });

  it("ignores a neighbour behind the walker", () => {
    const d = visibleDistance(
      { x: 0, y: 0 },
      0.25,
      { x: 1, y: 0 },
      [{ x: -5, y: 0, radius: 0.25 }],
      [],
      10,
    );
    expect(d).toBe(10);
  });

  it("ignores a neighbour off to the side of the ray", () => {
    const d = visibleDistance(
      { x: 0, y: 0 },
      0.25,
      { x: 1, y: 0 },
      [{ x: 5, y: 5, radius: 0.25 }],
      [],
      10,
    );
    expect(d).toBe(10);
  });
});

describe("chooseHeading", () => {
  it("points straight at the goal when the field of view is clear", () => {
    const { direction } = chooseHeading(
      { position: { x: 0, y: 0 }, radius: 0.25 },
      [],
      [],
      { x: 10, y: 0 },
      moussaidParameters,
    );

    expect(direction.x).toBeCloseTo(1, 3);
    expect(direction.y).toBeCloseTo(0, 3);
  });

  it("deviates from the straight line when something blocks it directly ahead", () => {
    const { direction } = chooseHeading(
      { position: { x: 0, y: 0 }, radius: 0.25 },
      [{ x: 3, y: 0, radius: 2 }], // a wide obstacle centred right on the goal line
      [],
      { x: 10, y: 0 },
      moussaidParameters,
    );

    // No longer aimed dead ahead.
    expect(Math.abs(direction.y)).toBeGreaterThan(0.05);
  });

  it("returns zero at the goal itself", () => {
    const { direction, visibleDistance: sight } = chooseHeading(
      { position: { x: 5, y: 5 }, radius: 0.25 },
      [],
      [],
      { x: 5, y: 5 },
      moussaidParameters,
    );
    expect(direction).toEqual({ x: 0, y: 0 });
    expect(sight).toBe(0);
  });
});

describe("stepCrowdMoussaid", () => {
  const noWalls = createWallIndex([]);

  it("moves a lone walker toward its target and exits it there", () => {
    const a = agent({ x: 0, y: 0, targetX: 0.3, targetY: 0 });
    const { agents, exitedCount } = stepCrowdMoussaid({
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

  it("makes real forward progress toward its target over time", () => {
    let agents: SimulationAgent[] = [agent({ x: 0, y: 0, targetX: 20, targetY: 0 })];
    for (let step = 0; step < 60 * 5; step++) {
      const result = stepCrowdMoussaid({
        agents,
        dtSeconds: 1 / 60,
        meanSpeedMetersPerSecond: 1.34,
        walls: noWalls,
        isExitBound: () => false,
        exitRadius: () => 0,
      });
      agents = result.agents;
    }

    expect(agents[0].x).toBeGreaterThan(5);
  });

  it("does not walk anyone through a wall", () => {
    const walls = createWallIndex([{ x1: 2, y1: -5, x2: 2, y2: 5 }]);
    let agents: SimulationAgent[] = [agent({ x: 0, y: 0, targetX: 10, targetY: 0 })];

    for (let step = 0; step < 60 * 5; step++) {
      const result = stepCrowdMoussaid({
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
