import { describe, expect, it } from "vitest";
import {
  parseScene,
  type CrowdSimScene,
  type ScenePoint,
} from "@crowdsim/scene-schema";
import { constrainMovement, wallSegmentsFromScene } from "./sceneGeometry";

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

describe("wallSegmentsFromScene", () => {
  const base = { schemaVersion: "1.0.0", id: "solids", name: "Solids", world };
  const square = (x0: number, y0: number, x1: number, y1: number) => ({
    type: "polygon" as const,
    points: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
  });
  const crosses = (scene: CrowdSimScene, from: ScenePoint, to: ScenePoint) =>
    constrainMovement(from, to, wallSegmentsFromScene(scene), world).blocked;

  it("stops walkers at an obstacle that blocks movement, but not at one that does not", () => {
    const barrier = {
      id: "barrier",
      kind: "constructionBarrier",
      geometry: {
        type: "polyline",
        points: [
          { x: 50, y: 0 },
          { x: 50, y: 80 },
        ],
      },
    };
    const blocking = parseScene({ ...base, obstacles: [barrier] });
    const decorative = parseScene({
      ...base,
      obstacles: [{ ...barrier, blocksMovement: false }],
    });

    expect(crosses(blocking, { x: 49.5, y: 40 }, { x: 50.5, y: 40 })).toBe(true);
    expect(crosses(decorative, { x: 49.5, y: 40 }, { x: 50.5, y: 40 })).toBe(false);
  });

  it("seals blocked areas and non-walkable zones", () => {
    const scene = parseScene({
      ...base,
      areas: [{ id: "closed", kind: "blocked", geometry: square(10, 10, 20, 20) }],
      zones: [{ id: "plant", walkable: false, geometry: square(60, 10, 70, 20) }],
    });

    expect(crosses(scene, { x: 15, y: 9.5 }, { x: 15, y: 10.5 })).toBe(true);
    expect(crosses(scene, { x: 65, y: 9.5 }, { x: 65, y: 10.5 })).toBe(true);
  });

  it("walls a building in except for a doorway at each entrance on its facade", () => {
    const scene = parseScene({
      ...base,
      buildings: [
        {
          id: "arcade",
          footprint: square(20, 10, 60, 30),
          entrancePosition: { x: 40, y: 30 },
        },
        { id: "sealed", footprint: square(80, 10, 100, 30) },
      ],
      shops: [
        {
          id: "shop",
          position: { x: 28, y: 24 },
          // A step out on the pavement, not exactly on the facade line.
          entrancePosition: { x: 28, y: 32 },
          size: { width: 6, height: 4 },
        },
      ],
    });

    // Through the building's own door and the shop's door.
    expect(crosses(scene, { x: 40, y: 30.5 }, { x: 40, y: 29.5 })).toBe(false);
    expect(crosses(scene, { x: 28, y: 30.5 }, { x: 28, y: 29.5 })).toBe(false);
    // Anywhere else on the facade, and anywhere into the building with no entrance.
    expect(crosses(scene, { x: 50, y: 30.5 }, { x: 50, y: 29.5 })).toBe(true);
    expect(crosses(scene, { x: 90, y: 30.5 }, { x: 90, y: 29.5 })).toBe(true);
  });
});
