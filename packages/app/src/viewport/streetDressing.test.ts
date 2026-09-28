import { describe, expect, it } from "vitest";
import { streetDressingPlacements } from "./streetDressing";

const points = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 20, y: 0 },
  { x: 30, y: 0 },
];

describe("streetDressingPlacements", () => {
  it("dresses every other road point with a tree and a street light", () => {
    const { trees, lights } = streetDressingPlacements(points);
    // points 0 and 2 are dressed (index % 2 === 0)
    expect(trees).toHaveLength(2);
    expect(lights).toHaveLength(2);
  });

  it("offsets trees and lights to opposite sides of the road point", () => {
    const { trees, lights } = streetDressingPlacements([{ x: 0, y: 0 }]);
    expect(trees[0]).toEqual({ x: 4, y: 5 });
    expect(lights[0]).toEqual({ x: -5, y: -4 });
  });

  it("returns nothing for an empty road", () => {
    expect(streetDressingPlacements([])).toEqual({ trees: [], lights: [] });
  });
});
