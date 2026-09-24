import { describe, expect, it } from "vitest";
import { defaultDemoScene } from "./defaultDemoScene";
import { contains, createCityLayout, districtKeepOut, overlaps } from "./cityLayout";
import { placeInScene } from "./worldPlacement";

describe("city layout", () => {
  const layout = createCityLayout(defaultDemoScene);

  it("never builds inside the simulated district", () => {
    // The old filler shared the ground the crowd walks on. Nothing generated
    // may enter the district or its ring road.
    for (const building of layout.buildings) {
      expect(overlaps(building.rect, layout.district)).toBe(false);
    }
    for (const block of layout.blocks) {
      expect(overlaps(block.rect, layout.district)).toBe(false);
    }
  });

  it("keeps plaza trees off everything people walk to", () => {
    const keepOut = districtKeepOut(defaultDemoScene);
    const insideTrees = layout.trees.filter((tree) =>
      contains(layout.district, tree.x, tree.y),
    );

    expect(insideTrees.length).toBeGreaterThan(0);
    for (const tree of insideTrees) {
      expect(keepOut.some((rect) => contains(rect, tree.x, tree.y))).toBe(false);
    }
  });

  it("surrounds the district with a real city, not a slab", () => {
    expect(layout.buildings.length).toBeGreaterThan(60);
    expect(layout.streets.length).toBeGreaterThan(8);
    // Blocks exist on every side of the district.
    const sides = {
      east: layout.blocks.some((block) => block.rect.minX >= layout.district.maxX),
      north: layout.blocks.some((block) => block.rect.maxY <= layout.district.minY),
      south: layout.blocks.some((block) => block.rect.minY >= layout.district.maxY),
      west: layout.blocks.some((block) => block.rect.maxX <= layout.district.minX),
    };
    expect(sides).toEqual({ east: true, north: true, south: true, west: true });
  });

  it("varies the skyline instead of stamping one box", () => {
    const styles = new Set(layout.buildings.map((building) => building.style));
    const heights = layout.buildings.map((building) => building.heightMeters);

    expect(styles.size).toBeGreaterThanOrEqual(4);
    expect(Math.max(...heights)).toBeGreaterThan(Math.min(...heights) * 4);
  });

  it("puts the tall buildings downtown, next to the district", () => {
    const centre = {
      x: defaultDemoScene.world.width / 2,
      y: defaultDemoScene.world.height / 2,
    };
    const distance = (building: (typeof layout.buildings)[number]) =>
      Math.hypot(
        (building.rect.minX + building.rect.maxX) / 2 - centre.x,
        (building.rect.minY + building.rect.maxY) / 2 - centre.y,
      );
    const sorted = [...layout.buildings].sort((a, b) => distance(a) - distance(b));
    const third = Math.floor(sorted.length / 3);
    const mean = (list: typeof sorted) =>
      list.reduce((sum, building) => sum + building.heightMeters, 0) / list.length;

    expect(mean(sorted.slice(0, third))).toBeGreaterThan(mean(sorted.slice(-third)));
  });

  it("is deterministic for a scene", () => {
    expect(createCityLayout(defaultDemoScene)).toEqual(layout);
  });

  it("gives every building a positive footprint", () => {
    for (const building of layout.buildings) {
      expect(building.rect.maxX - building.rect.minX).toBeGreaterThanOrEqual(6);
      expect(building.rect.maxY - building.rect.minY).toBeGreaterThanOrEqual(6);
      expect(building.heightMeters).toBeGreaterThan(3);
    }
  });
});

describe("city layout stability under edits", () => {
  it("only removes plaza trees where something is built, never moves the rest", () => {
    const before = createCityLayout(defaultDemoScene).trees;
    const edited = placeInScene(defaultDemoScene, "building", { x: 40, y: 86 })!;
    const after = createCityLayout(edited).trees;

    const key = (tree: { rotation: number; scale: number; x: number; y: number }) =>
      [tree.x, tree.y, tree.rotation, tree.scale].map((n) => n.toFixed(6)).join(",");
    const original = new Set(before.map(key));
    const moved = after.filter((tree) => !original.has(key(tree)));

    expect(after.length).toBeLessThanOrEqual(before.length);
    expect(moved).toEqual([]);
  });
});
