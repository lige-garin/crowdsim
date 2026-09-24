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

  it("routes through a door as narrow as RiMEA's own literature widths (0.8-1.8 m)", () => {
    // At the old 1 m routing-grid floor these gaps sealed shut on both sides
    // (documented in rimea/shared.ts's routingGapMeters and rimea/test12Bottleneck.ts;
    // several RiMEA scenes had to widen their doors to 2.0-2.4 m to route at all).
    // With the finer 0.2 m floor, every one of the guideline's own widths should
    // now have room for a fully open cell between the two jambs.
    for (const gapWidth of [0.8, 1.0, 1.2, 1.4, 1.6, 1.8]) {
      const jambY0 = 20 - gapWidth / 2;
      const jambY1 = 20 + gapWidth / 2;
      const narrowDoor: WallSegment[] = [
        { x1: 30, y1: 0, x2: 30, y2: jambY0 },
        { x1: 30, y1: jambY1, x2: 30, y2: 40 },
      ];
      const router = createRouter(world, narrowDoor);
      const distance = router.distance({ x: 5, y: 20 }, { x: 55, y: 20 });
      expect(distance, `gap width ${gapWidth} m should route`).toBeLessThan(Infinity);
    }
  });

  it("still converges quickly on a mostly-open grid at the finer cell size", () => {
    // An empty walls array short-circuits createRouter to straightLineRouter
    // (skipping the grid entirely), so this needs at least one real wall to
    // exercise buildDistanceField — a short stub well out of the way of the
    // direct path. The finer routeCellSizeMeters pushes this grid close to
    // the maxRouteCells cap (~40k cells). Without a settled bitmap in the
    // Dijkstra loop, lazy deletion let float32 rounding noise re-trigger
    // "improvements" between neighbours indefinitely on a grid this size —
    // verified directly (unbounded push growth, never converged) before the
    // fix was added.
    const bigWorld = { width: 60, height: 40 };
    const stubWall: WallSegment[] = [{ x1: 0, y1: 0, x2: 1, y2: 0 }];
    const router = createRouter(bigWorld, stubWall);
    const started = Date.now();
    const distance = router.distance({ x: 5, y: 20 }, { x: 55, y: 20 });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(distance).toBeCloseTo(50, 0);
  });

  it("keeps a clear, untolled path down the centre of a 2 m corridor", () => {
    // A 1 m-radius wall-clearance toll (matching the old grid's incidental
    // 1-cell = 1 m radius) tolls every cell of a 2 m corridor, since its
    // centre line sits exactly 1 m from either wall. That made the Dijkstra
    // field prefer detouring through the open world outside the corridor
    // over walking straight down it, freezing some walkers at birth (RiMEA
    // test 7, 6 of 50 never arrived) — verified directly by reverting to a
    // 1 m radius and reproducing the same detour-preferred distances.
    const corridorWorld = { width: 46, height: 6 };
    const corridorWalls: WallSegment[] = [
      { x1: 0, y1: 2, x2: 45, y2: 2 },
      { x1: 0, y1: 4, x2: 45, y2: 4 },
    ];
    const router = createRouter(corridorWorld, corridorWalls);
    const centreLine = router.distance({ x: 2, y: 3 }, { x: 43, y: 3 });
    const outsideDetour = router.distance({ x: 2, y: 1.9 }, { x: 43, y: 3 });
    // The direct walk down the centre (41 m) must not cost more than going
    // around outside the corridor entirely.
    expect(centreLine).toBeLessThan(outsideDetour);
    expect(centreLine).toBeCloseTo(41, 0);
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
