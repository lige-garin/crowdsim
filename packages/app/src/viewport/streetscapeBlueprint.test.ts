import { describe, expect, it } from "vitest";
import { streetscapeBlueprint } from "./streetscapeBlueprint";

const world = { width: 160, height: 96 };
const HEX = /^#[0-9a-f]{6}$/i;

describe("streetscapeBlueprint", () => {
  it("produces a block of several buildings", () => {
    expect(streetscapeBlueprint(world, 31).length).toBeGreaterThanOrEqual(6);
  });

  it("keeps every building inside the world footprint", () => {
    for (const b of streetscapeBlueprint(world, 31)) {
      expect(b.x - b.width / 2).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width / 2).toBeLessThanOrEqual(world.width);
      expect(b.y - b.depth / 2).toBeGreaterThanOrEqual(0);
      expect(b.y + b.depth / 2).toBeLessThanOrEqual(world.height);
    }
  });

  it("is deterministic for a given seed", () => {
    expect(streetscapeBlueprint(world, 31)).toEqual(streetscapeBlueprint(world, 31));
  });

  it("varies with the seed", () => {
    const a = streetscapeBlueprint(world, 1);
    const b = streetscapeBlueprint(world, 2);
    expect(a.map((x) => x.height)).not.toEqual(b.map((x) => x.height));
  });

  it("emits positive sizes and valid colours", () => {
    for (const b of streetscapeBlueprint(world, 7)) {
      expect(b.width).toBeGreaterThan(0);
      expect(b.depth).toBeGreaterThan(0);
      expect(b.height).toBeGreaterThan(0);
      expect(b.color).toMatch(HEX);
    }
  });
});
