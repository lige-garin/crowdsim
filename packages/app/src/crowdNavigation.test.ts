import type { WallSegment } from "@crowdsim/core-gpu";
import { describe, expect, it } from "vitest";
import { createRouter, maxRouteFields } from "./crowdNavigation";
import { constrainMovement } from "./sceneGeometry";
import { createWallIndex } from "./wallIndex";

const world = { width: 60, height: 40 };
// A wall across the middle with a 4 m doorway at x 28..32.
const wallWithDoor: WallSegment[] = [
  { x1: 0, y1: 20, x2: 28, y2: 20 },
  { x1: 32, y1: 20, x2: 60, y2: 20 },
];

/** Walk from `from` to `to` with the router and the hard wall constraint. */
function walk(
  walls: WallSegment[],
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const router = createRouter(world, walls);
  let position = from;
  let travelled = 0;
  for (let step = 0; step < 4000; step++) {
    if (Math.hypot(to.x - position.x, to.y - position.y) < 0.5) {
      return { arrived: true, position, travelled };
    }
    const direction = router.direction(position, to);
    const next = constrainMovement(
      position,
      { x: position.x + direction.x * 0.1, y: position.y + direction.y * 0.1 },
      walls,
      world,
    );
    travelled += Math.hypot(next.x - position.x, next.y - position.y);
    position = next;
  }
  return { arrived: false, position, travelled };
}

describe("createRouter", () => {
  it("routes around a wall through its doorway", () => {
    const result = walk(wallWithDoor, { x: 5, y: 10 }, { x: 5, y: 30 });

    expect(result.arrived).toBe(true);
    // Straight line is 20 m; via the door at x≈30 it is ~2·√(25²+10²) ≈ 54 m.
    expect(result.travelled).toBeGreaterThan(45);
    expect(result.travelled).toBeLessThan(62);
  });

  it("walks a straight line when nothing is in the way", () => {
    const result = walk(wallWithDoor, { x: 5, y: 5 }, { x: 55, y: 15 });

    expect(result.arrived).toBe(true);
    expect(result.travelled).toBeLessThan(Math.hypot(50, 10) + 0.6);
  });

  it("reports route distance, and Infinity when the target is sealed off", () => {
    const router = createRouter(world, wallWithDoor);
    const sealed = createRouter(world, [{ x1: 0, y1: 20, x2: 60, y2: 20 }]);

    expect(router.distance({ x: 5, y: 10 }, { x: 5, y: 30 })).toBeGreaterThan(45);
    expect(sealed.distance({ x: 5, y: 10 }, { x: 5, y: 30 })).toBe(Infinity);
  });

  it("does not leak through a thin diagonal wall", () => {
    const diagonal: WallSegment[] = [{ x1: 0, y1: 0, x2: 40, y2: 40 }];
    const router = createRouter(world, diagonal);

    // The wall runs corner to corner of a 40 m square and meets the top edge,
    // so the two sides only connect around its far end at (40, 40).
    expect(router.distance({ x: 30, y: 5 }, { x: 5, y: 30 })).toBeGreaterThan(50);
  });

  it("keeps a bounded number of distance fields", () => {
    const router = createRouter(world, wallWithDoor);
    for (let index = 0; index < maxRouteFields + 20; index++) {
      router.distance({ x: 1, y: 1 }, { x: index % 60, y: 30 + (index % 9) });
    }

    expect(router.fieldCount()).toBeLessThanOrEqual(maxRouteFields);
  });

  it("walks straight when the scene has no walls or no world", () => {
    const open = createRouter(undefined, wallWithDoor);

    expect(open.direction({ x: 0, y: 0 }, { x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 });
    expect(open.distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe("createWallIndex", () => {
  it("returns only nearby walls, each once", () => {
    const long = { x1: 0, y1: 10, x2: 100, y2: 10 };
    const far = { x1: 0, y1: 90, x2: 5, y2: 90 };
    const index = createWallIndex([long, far]);

    expect(index.near(50, 11, 1)).toEqual([long]);
    expect(index.near(2, 89, 1)).toEqual([far]);
    expect(index.near(50, 50, 1)).toEqual([]);
  });
});
