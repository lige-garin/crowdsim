import { describe, expect, it } from "vitest";
import { bioCityDemoScene } from "./bioCityDemoScene";
import { createBioCityAssetLoadPlans } from "./bioCityModelAssets";
import { createBioCityRenderPlan } from "./bioCityRenderPlan";

describe("bioCityModelAssets", () => {
  it("plans GLB and GLTF assets for GLTFLoader with placeholder fallback", () => {
    const renderPlan = createBioCityRenderPlan(bioCityDemoScene, 0);
    const loadPlans = createBioCityAssetLoadPlans(renderPlan.assets);

    expect(loadPlans).toEqual([
      {
        fallback: "placeholder",
        id: "asset-rain-market-streetscape",
        loader: "gltf-loader",
        sourceUrl: "/assets/biocity/rain-market-streetscape.glb",
      },
      {
        fallback: "placeholder",
        id: "asset-bus-stop-shelter",
        loader: "gltf-loader",
        sourceUrl: "/assets/biocity/bus-stop-shelter.glb",
      },
    ]);
  });

  it("keeps 3D tiles on the tileset renderer path", () => {
    const renderPlan = createBioCityRenderPlan(
      {
        ...bioCityDemoScene,
        visualAssets: [
          {
            anchor: { x: 80, y: 48, z: 0 },
            collisionMode: "none",
            id: "city-tiles",
            kind: "tileset",
            lod: "medium",
            rotationDegrees: 0,
            scale: 1,
            sourceUrl: "/assets/biocity/tileset.json",
            visible: true,
            customParameters: {},
          },
        ],
      },
      0,
    );

    expect(createBioCityAssetLoadPlans(renderPlan.assets)[0]).toMatchObject({
      fallback: "placeholder",
      id: "asset-city-tiles",
      loader: "tileset-renderer",
    });
  });
});
