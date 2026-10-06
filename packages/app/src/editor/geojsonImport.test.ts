import { describe, expect, it } from "vitest";
import { demoScene } from "../scenes/demoScene";
import { createSceneFromGeoJson } from "./geojsonImport";

/** A real block in Shenyang: roughly 90 m by 110 m. */
const blockRing = [
  [123.46, 41.8],
  [123.461, 41.8],
  [123.461, 41.801],
  [123.46, 41.801],
  [123.46, 41.8],
];

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

  it("reads degrees as metres, which is what the old importer got wrong", () => {
    // The regression: coordinates used to be copied into x/y verbatim, so this
    // block came out 123 m × 42 m. It is a 0.001° × 0.001° block, which at
    // this latitude is about 83 m × 111 m.
    const scene = createSceneFromGeoJson(demoScene, {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { id: "block" },
          geometry: { type: "Polygon", coordinates: [blockRing] },
        },
      ],
    });

    const points =
      scene.walls.find((wall) => wall.id === "block")?.geometry.points ?? [];
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);

    expect(width).toBeGreaterThan(75);
    expect(width).toBeLessThan(95);
    expect(height).toBeGreaterThan(100);
    expect(height).toBeLessThan(125);
  });

  it("leaves nothing off the world it was imported into", () => {
    const scene = createSceneFromGeoJson(demoScene, {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { id: "block" },
          geometry: { type: "Polygon", coordinates: [blockRing] },
        },
      ],
    });
    const points =
      scene.walls.find((wall) => wall.id === "block")?.geometry.points ?? [];

    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeGreaterThanOrEqual(0);
    }
    expect(scene.world.width).toBeGreaterThanOrEqual(
      Math.max(...points.map((p) => p.x)),
    );
    expect(scene.world.height).toBeGreaterThanOrEqual(
      Math.max(...points.map((p) => p.y)),
    );
  });

  it("keeps distances, so a projected footprint is still the same shape", () => {
    const scene = createSceneFromGeoJson(demoScene, {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { id: "block" },
          geometry: { type: "Polygon", coordinates: [blockRing] },
        },
      ],
    });
    const points =
      scene.walls.find((wall) => wall.id === "block")?.geometry.points ?? [];

    // The ring's diagonal against its width: the aspect ratio survives both
    // the projection and the shift onto the world.
    const width =
      Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
    const height =
      Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y));

    expect(height / width).toBeCloseTo(111 / 83, 1);
  });

  it("takes already-projected coordinates at their word when asked to", () => {
    const scene = createSceneFromGeoJson(
      demoScene,
      {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { id: "metres" },
            geometry: {
              type: "LineString",
              coordinates: [
                [10, 10],
                [30, 10],
              ],
            },
          },
        ],
      },
      { coordinateSystem: "meters" },
    );

    const points =
      scene.walls.find((wall) => wall.id === "metres")?.geometry.points ?? [];

    expect(points[0]).toEqual({ x: 10, y: 10 });
    expect(points[1]).toEqual({ x: 30, y: 10 });
  });

  it("refuses a geographic file carrying numbers no coordinate can hold", () => {
    // Refusing rather than projecting nonsense: a value of 12345 is either a
    // metre or a mistake, and either way it is not a longitude.
    expect(() =>
      createSceneFromGeoJson(demoScene, {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { id: "huge" },
            geometry: {
              type: "LineString",
              coordinates: [
                [12345, 6789],
                [12346, 6790],
              ],
            },
          },
        ],
      }),
    ).toThrow(/coordinateSystem: "meters"/);
  });

  it("brings an AMap (GCJ-02) file onto the same plane as a WGS-84 one", () => {
    const gcjRing = [
      [123.4667, 41.8045],
      [123.4677, 41.8045],
      [123.4677, 41.8055],
      [123.4667, 41.8045],
    ];
    const scene = createSceneFromGeoJson(
      demoScene,
      {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { id: "amap" },
            geometry: { type: "Polygon", coordinates: [gcjRing] },
          },
        ],
      },
      { coordinateSystem: "gcj02" },
    );
    const points =
      scene.walls.find((wall) => wall.id === "amap")?.geometry.points ?? [];
    const width =
      Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));

    // Same 0.001° of longitude, so the same ~83 m across whichever system
    // the file was written in.
    expect(width).toBeGreaterThan(75);
    expect(width).toBeLessThan(95);
  });
});
