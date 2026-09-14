import type { WallSegment } from "@crowdsim/core-gpu";
import { describe, expect, it } from "vitest";
import { createRouter } from "./crowdNavigation";
import { stepCrowd } from "./crowdMovement";
import type { SimulationAgent } from "./simulationEngine";
import { createWallIndex } from "./wallIndex";

const world = { width: 40, height: 20 };

function walker(overrides: Partial<SimulationAgent>): SimulationAgent {
  return {
    id: 1,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    targetX: 0,
    targetY: 0,
    radius: 0.23,
    speedFactor: 1,
    lifecycleState: "walk",
    ...overrides,
  };
}

function run(
  start: SimulationAgent[],
  seconds: number,
  walls: WallSegment[] = [],
  onStep?: (agents: SimulationAgent[]) => void,
) {
  const router = createRouter(world, walls);
  const index = createWallIndex(walls);
  let agents = start;
  for (let step = 0; step < seconds * 60; step++) {
    agents = stepCrowd({
      agents,
      dtSeconds: 1 / 60,
      exitRadius: () => 0,
      isExitBound: () => false,
      meanSpeedMetersPerSecond: 1.34,
      router,
      seed: 1,
      walls: index,
      world,
    }).agents;
    onStep?.(agents);
  }
  return agents;
}

const closestGap = (agents: SimulationAgent[]) => {
  let gap = Infinity;
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      gap = Math.min(
        gap,
        Math.hypot(agents[i].x - agents[j].x, agents[i].y - agents[j].y),
      );
    }
  }
  return gap;
};

describe("stepCrowd", () => {
  it("lets two people walking head-on pass without walking through each other", () => {
    let tightest = Infinity;
    const end = run(
      [
        walker({ id: 1, x: 5, y: 10, targetX: 35, targetY: 10 }),
        walker({ id: 2, x: 35, y: 10.05, targetX: 5, targetY: 10.05 }),
      ],
      30,
      [],
      (agents) => {
        tightest = Math.min(tightest, closestGap(agents));
      },
    );

    expect(end[0].x).toBeGreaterThan(34);
    expect(end[1].x).toBeLessThan(6);
    // Two bodies of 0.23 m: centres never closer than most of a shoulder width.
    expect(tightest).toBeGreaterThan(0.35);
  });

  it("lets a faster walker overtake a slower one", () => {
    const end = run(
      [
        walker({ id: 1, x: 5, y: 10, speedFactor: 0.7, targetX: 39, targetY: 10 }),
        walker({ id: 2, x: 3, y: 10, speedFactor: 1.3, targetX: 39, targetY: 10 }),
      ],
      12,
    );

    expect(end[1].x).toBeGreaterThan(end[0].x);
  });

  it("brings someone holding a spot back to it after being crowded", () => {
    const end = run(
      [
        walker({
          id: 1,
          x: 20,
          y: 10,
          lifecycleState: "browse",
          targetX: 20,
          targetY: 10,
        }),
        walker({
          id: 2,
          x: 20.1,
          y: 10,
          lifecycleState: "browse",
          targetX: 20.1,
          targetY: 10,
        }),
      ],
      10,
    );

    expect(closestGap(end)).toBeGreaterThan(0.3);
    expect(Math.hypot(end[0].x - 20, end[0].y - 10)).toBeLessThan(0.5);
  });

  it("never pushes anyone through a wall, however hard the crowd presses", () => {
    const wall: WallSegment = { x1: 20, y1: 0, x2: 20, y2: 20 };
    const crowd = Array.from({ length: 40 }, (_, index) =>
      walker({
        id: index + 1,
        x: 14 + (index % 8) * 0.6,
        y: 7 + Math.floor(index / 8) * 0.6,
        targetX: 30,
        targetY: 10,
      }),
    );
    let crossed = 0;
    run(crowd, 20, [wall], (agents) => {
      crossed = Math.max(crossed, agents.filter((agent) => agent.x > 20).length);
    });

    expect(crossed).toBe(0);
  });
});
