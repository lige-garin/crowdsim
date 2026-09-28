import { describe, expect, it } from "vitest";
import { demoScene } from "../scenes/demoScene";
import { createSceneFromGeoJson } from "./geojsonImport";

describe("GeoJSON import", () => {
  it("imports line and polygon features as wall polylines", () => {
    const scene = createSceneFromGeoJson(demoScene, {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { id: "line-a" },
          geometry: {
            type: "LineString",
            coordinates: [
              [1, 2],
              [3, 4],
            ],
          },
        },
        {
          type: "Feature",
          properties: { id: "shop-shell" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [10, 10],
                [20, 10],
                [20, 20],
                [10, 10],
              ],
            ],
          },
        },
      ],
    });

    expect(scene.walls.map((wall) => wall.id)).toContain("line-a");
    expect(scene.walls.map((wall) => wall.id)).toContain("shop-shell");
    expect(scene.walls.at(-1)?.geometry.points).toHaveLength(4);
  });
});
