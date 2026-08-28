import { describe, expect, it } from "vitest";
import { constrainMovement } from "./sceneGeometry";

const verticalWall = [{ x1: 25, y1: 0, x2: 25, y2: 80 }];
const world = { width: 120, height: 80 };

describe("constrainMovement", () => {
  it("blocks a step through a wall the agent has crept up against", () => {
    // A walker that stops just short of a wall keeps pressing into it every
    // step; a tolerance measured as a fraction of the step used to wave the
    // wall through once the remaining gap was under 2% of one step.
    const start = { x: 24.9998, y: 40 };
    const resolved = constrainMovement(
      start,
      { x: start.x + 0.1333, y: 40 },
      verticalWall,
      world,
    );

    expect(resolved.blocked).toBe(true);
    expect(resolved.x).toBeLessThan(25);
  });

  it("lets an agent standing on a wall step away from it", () => {
    const resolved = constrainMovement(
      { x: 25, y: 40 },
      { x: 24, y: 40 },
      verticalWall,
      world,
    );

    expect(resolved.blocked).toBe(false);
    expect(resolved.x).toBe(24);
  });

  it("slides along a wall instead of stopping dead on a glancing hit", () => {
    const resolved = constrainMovement(
      { x: 24.9, y: 40 },
      { x: 25.1, y: 41 },
      verticalWall,
      world,
    );

    expect(resolved.blocked).toBe(true);
    expect(resolved.x).toBeLessThan(25);
    expect(resolved.y).toBeGreaterThan(40);
  });

  it("keeps movement inside the world bounds", () => {
    const resolved = constrainMovement({ x: 1, y: 1 }, { x: -5, y: 200 }, [], world);

    expect(resolved).toEqual({ blocked: false, x: 0, y: 80 });
  });
});
