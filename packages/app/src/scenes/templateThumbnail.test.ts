import { describe, expect, it } from "vitest";
import { defaultDemoScene } from "./defaultDemoScene";
import { industryTemplates } from "./industryTemplates";
import { buildSceneThumbnail } from "./templateThumbnail";

describe("buildSceneThumbnail", () => {
  it("scales walls, entrances, shops, and buildings into the fixed viewBox", () => {
    const thumbnail = buildSceneThumbnail(defaultDemoScene);

    expect(thumbnail.entrances.length).toBe(defaultDemoScene.entrances.length);
    expect(thumbnail.shops.length).toBe(defaultDemoScene.shops.length);
    expect(thumbnail.buildings.length).toBe(defaultDemoScene.buildings.length);

    for (const rect of [
      ...thumbnail.entrances,
      ...thumbnail.shops,
      ...thumbnail.buildings,
    ]) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x).toBeLessThanOrEqual(thumbnail.viewBoxSize);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeLessThanOrEqual(thumbnail.viewBoxSize);
    }

    for (const line of thumbnail.walls) {
      for (const coordinate of [line.x1, line.x2]) {
        expect(coordinate).toBeGreaterThanOrEqual(0);
        expect(coordinate).toBeLessThanOrEqual(thumbnail.viewBoxSize);
      }
    }
  });

  it("gives every industry template a distinguishable thumbnail, not the same empty floor", () => {
    // The point of adding buildings/shops to the six templates
    // (2026-09-24) was exactly this: template cards on the home screen
    // should no longer look like the same bare floor plan. This is the
    // decisive check for the gallery, not just the 3D view.
    for (const template of industryTemplates) {
      const thumbnail = buildSceneThumbnail(template.scene);
      expect(
        thumbnail.buildings.length + thumbnail.shops.length,
        `${template.id}: thumbnail has no buildings or shops to distinguish it`,
      ).toBeGreaterThan(0);
    }
  });

  it("closes a wall drawn as a polygon but leaves an open polyline open", () => {
    const scene = {
      ...defaultDemoScene,
      entrances: [],
      shops: [],
      walls: [
        {
          floorId: undefined,
          geometry: {
            points: [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
              { x: 10, y: 10 },
            ],
            type: "polygon" as const,
          },
          id: "wall-triangle",
          thickness: 0.2,
        },
        {
          floorId: undefined,
          geometry: {
            points: [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
            ],
            type: "polyline" as const,
          },
          id: "wall-line",
          thickness: 0.2,
        },
      ],
      world: { height: 20, width: 20 },
    };

    const thumbnail = buildSceneThumbnail(scene);

    // Triangle: 2 edges between its 3 points, plus 1 closing edge back to the start.
    // Line: 1 edge between its 2 points, no closing edge.
    expect(thumbnail.walls.length).toBe(3 + 1);
  });

  it("only draws entities on the scene's first floor", () => {
    const scene = {
      ...defaultDemoScene,
      entrances: [
        { ...defaultDemoScene.entrances[0], floorId: "floor-0" },
        { ...defaultDemoScene.entrances[0], floorId: "floor-1" },
      ],
      floors: [
        { basemapIds: [], elevationMeters: 0, id: "floor-0", level: 0, visible: true },
        { basemapIds: [], elevationMeters: 4, id: "floor-1", level: 1, visible: true },
      ],
      shops: [],
      walls: [],
    };

    const thumbnail = buildSceneThumbnail(scene);

    expect(thumbnail.entrances.length).toBe(1);
  });
});
