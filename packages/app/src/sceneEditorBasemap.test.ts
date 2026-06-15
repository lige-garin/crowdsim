import { describe, expect, it } from "vitest";
import { demoScene } from "./demoScene";
import {
  addImportedBasemap,
  getActiveBasemap,
  toggleBasemapBoolean,
  updateBasemapNumber,
} from "./sceneEditorBasemap";

describe("scene editor basemap state", () => {
  it("adds an imported basemap with world-sized defaults", () => {
    const scene = addImportedBasemap(demoScene, {
      name: "mall-1f.png",
      sourceUri: "data:image/png;base64,abc",
    });

    expect(scene.basemaps).toHaveLength(1);
    expect(scene.basemaps[0]).toMatchObject({
      heightMeters: demoScene.world.height,
      id: "basemap-1",
      name: "mall-1f.png",
      opacity: 0.65,
      sourceUri: "data:image/png;base64,abc",
      visible: true,
      widthMeters: demoScene.world.width,
    });
  });

  it("keeps only the newest imported basemap visible", () => {
    const first = addImportedBasemap(demoScene, {
      name: "first.png",
      sourceUri: "data:image/png;base64,first",
    });
    const second = addImportedBasemap(first, {
      name: "second.png",
      sourceUri: "data:image/png;base64,second",
    });

    expect(second.basemaps.map((basemap) => basemap.visible)).toEqual([false, true]);
    expect(getActiveBasemap(second)?.name).toBe("second.png");
  });

  it("updates transform, opacity, size and lock state", () => {
    let scene = addImportedBasemap(demoScene, {
      name: "mall-1f.png",
      sourceUri: "data:image/png;base64,abc",
    });

    scene = updateBasemapNumber(scene, "basemap-1", "x", 4);
    scene = updateBasemapNumber(scene, "basemap-1", "y", 6);
    scene = updateBasemapNumber(scene, "basemap-1", "scale", 1.25);
    scene = updateBasemapNumber(scene, "basemap-1", "rotationDegrees", 8);
    scene = updateBasemapNumber(scene, "basemap-1", "opacity", 2);
    scene = updateBasemapNumber(scene, "basemap-1", "widthMeters", 42);
    scene = toggleBasemapBoolean(scene, "basemap-1", "locked");

    expect(scene.basemaps[0].transform).toMatchObject({
      rotationDegrees: 8,
      scale: 1.25,
      x: 4,
      y: 6,
    });
    expect(scene.basemaps[0].opacity).toBe(1);
    expect(scene.basemaps[0].widthMeters).toBe(42);
    expect(scene.basemaps[0].locked).toBe(true);
  });

  it("stores scale calibration as meters per image pixel", () => {
    let scene = addImportedBasemap(demoScene, {
      name: "mall-1f.png",
      sourceUri: "data:image/png;base64,abc",
    });

    scene = updateBasemapNumber(scene, "basemap-1", "imageDistancePixels", 400);
    scene = updateBasemapNumber(scene, "basemap-1", "realDistanceMeters", 20);

    expect(scene.basemaps[0].calibration).toMatchObject({
      imagePointA: { x: 0, y: 0 },
      imagePointB: { x: 400, y: 0 },
      metersPerPixel: 0.05,
      realDistanceMeters: 20,
    });
  });
});
