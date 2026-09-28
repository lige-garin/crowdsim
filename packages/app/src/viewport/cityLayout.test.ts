import { describe, expect, it } from "vitest";
import { defaultDemoScene } from "../scenes/defaultDemoScene";
import { exampleScenes } from "../scenes/exampleScenes";
import {
  characterOffsetFor,
  contains,
  createCityLayout,
  districtKeepOut,
  overlaps,
} from "./cityLayout";
import { placeInScene } from "../renderer/worldPlacement";

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

describe("dominant building character", () => {
  it("is a no-op with no buildings, matching the layout's long-standing default", () => {
    expect(characterOffsetFor({ ...defaultDemoScene, buildings: [] })).toBe(0);
  });

  it("is a no-op for a retail/mixedUse-majority scene", () => {
    // mall-atrium's two anchor stores are both kind "retail".
    expect(characterOffsetFor(exampleScenes[1])).toBe(0);
  });

  it("skews denser for a transit-majority scene", () => {
    // metro-station-hall's one building is kind "transit".
    expect(characterOffsetFor(exampleScenes[0])).toBeGreaterThan(0);
  });

  it("skews lower for a civic-majority scene", () => {
    // performance-venue's backstage block is kind "civic".
    expect(characterOffsetFor(exampleScenes[2])).toBeLessThan(0);
  });

  it("breaks an exact tie by array order, not some other rule", () => {
    // One "civic" and one "transit" building is a genuine tie (1 vs 1).
    // The function's own doc comment says this resolves to whichever kind
    // was declared first -- this is the decisive check for that claim, not
    // just a description of it.
    const civicFirst = characterOffsetFor({
      ...defaultDemoScene,
      buildings: [...exampleScenes[2].buildings, ...exampleScenes[0].buildings],
    });
    const transitFirst = characterOffsetFor({
      ...defaultDemoScene,
      buildings: [...exampleScenes[0].buildings, ...exampleScenes[2].buildings],
    });

    expect(civicFirst).toBeLessThan(0);
    expect(transitFirst).toBeGreaterThan(0);
  });

  it("actually changes the generated skyline, not just the offset value", () => {
    // Two scenes that differ only in their one declared building's kind
    // (and therefore only in characterOffsetFor's output) must produce a
    // different generated city under the same seed -- proving the bias
    // reaches `pickStyle`/`floorsFor`, not just the pure helper above.
    const transitScene = { ...defaultDemoScene, buildings: exampleScenes[0].buildings };
    const civicScene = { ...defaultDemoScene, buildings: exampleScenes[2].buildings };
    const transitStyles = createCityLayout(transitScene).buildings.map((b) => b.style);
    const civicStyles = createCityLayout(civicScene).buildings.map((b) => b.style);

    expect(transitStyles).not.toEqual(civicStyles);
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
