import { describe, expect, it } from "vitest";
import { convexHull2D, dedupeWalls, worldContaining } from "./importGeometry";

describe("convexHull2D", () => {
  it("returns a rectangle's own four corners", () => {
    const hull = convexHull2D([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 0, y: 2 },
    ]);
    expect(hull).toHaveLength(4);
    for (const corner of [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 0, y: 2 },
    ]) {
      expect(hull).toContainEqual(corner);
    }
  });

  it("drops a point strictly inside the hull of the others", () => {
    const hull = convexHull2D([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 10 },
      { x: 5, y: 3 }, // well inside the triangle above
    ]);
    expect(hull).toHaveLength(3);
    expect(hull).not.toContainEqual({ x: 5, y: 3 });
  });

  it("returns the input unchanged for fewer than three points", () => {
    expect(convexHull2D([])).toEqual([]);
    expect(convexHull2D([{ x: 1, y: 1 }])).toEqual([{ x: 1, y: 1 }]);
  });

  it("does not duplicate a point already exactly at a hull vertex", () => {
    const hull = convexHull2D([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 0, y: 2 },
      { x: 0, y: 0 }, // repeated corner, as a closed ring might carry
    ]);
    expect(hull).toHaveLength(4);
  });
});

describe("dedupeWalls", () => {
  it("keeps the first wall for a repeated id and drops later duplicates", () => {
    const walls = [
      { geometry: { points: [], type: "polyline" as const }, id: "a", thickness: 0.2 },
      { geometry: { points: [], type: "polyline" as const }, id: "b", thickness: 0.2 },
      { geometry: { points: [], type: "polyline" as const }, id: "a", thickness: 0.3 },
    ];
    const result = dedupeWalls(walls);
    expect(result.map((w) => w.id)).toEqual(["a", "b"]);
    expect(result[0].thickness).toBe(0.2);
  });
});

describe("worldContaining", () => {
  it("leaves the world unchanged when every wall already fits inside it", () => {
    const world = { height: 20, width: 20 };
    const walls = [{ geometry: { points: [{ x: 5, y: 5 }] } }];
    expect(worldContaining(world, walls)).toBe(world);
  });

  it("grows the world to contain a wall point outside it, rounded up with margin", () => {
    const world = { height: 20, width: 20 };
    const walls = [{ geometry: { points: [{ x: 25.2, y: 8 }] } }];
    const grown = worldContaining(world, walls);
    expect(grown.width).toBeGreaterThan(25.2);
    // Both dimensions are recomputed with the same +1 margin once either one
    // grows, even though height itself didn't need to -- the pre-existing
    // `dxfImport.ts` behaviour this function was extracted from unchanged.
    expect(grown.height).toBe(21);
  });
});
