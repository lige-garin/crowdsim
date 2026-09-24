import { describe, expect, it } from "vitest";
import { bioCityDemoScene } from "./bioCityDemoScene";
import { buildSceneThumbnail } from "./templateThumbnail";

describe("buildSceneThumbnail", () => {
  it("scales walls, entrances, and shops into the fixed viewBox", () => {
    const thumbnail = buildSceneThumbnail(bioCityDemoScene);

    expect(thumbnail.entrances.length).toBe(bioCityDemoScene.entrances.length);
    expect(thumbnail.shops.length).toBe(bioCityDemoScene.shops.length);

    for (const point of [...thumbnail.entrances, ...thumbnail.shops]) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(thumbnail.viewBoxSize);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(thumbnail.viewBoxSize);
    }

    for (const line of thumbnail.walls) {
      for (const coordinate of [line.x1, line.x2]) {
        expect(coordinate).toBeGreaterThanOrEqual(0);
        expect(coordinate).toBeLessThanOrEqual(thumbnail.viewBoxSize);
      }
    }
  });

  it("closes a wall drawn as a polygon but leaves an open polyline open", () => {
    const scene = {
      ...bioCityDemoScene,
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
      ...bioCityDemoScene,
      entrances: [
        { ...bioCityDemoScene.entrances[0], floorId: "floor-0" },
        { ...bioCityDemoScene.entrances[0], floorId: "floor-1" },
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
