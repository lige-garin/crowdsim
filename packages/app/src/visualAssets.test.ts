import { describe, expect, it } from "vitest";
import { bioCityDemoScene } from "./bioCityDemoScene";
import {
  createSketchUpImportPlan,
  createVisualAssetManifest,
  createVisualAssetManifestFromScene,
  demoVisualAssetManifest,
  summarizeVisualAssetManifest,
} from "./visualAssets";

describe("visual asset manifest", () => {
  it("keeps imported 3D assets visual-only", () => {
    const summary = summarizeVisualAssetManifest(demoVisualAssetManifest);

    expect(summary.assetCount).toBe(2);
    expect(summary.gltfCount).toBe(2);
    expect(summary.tilesetCount).toBe(0);
    expect(summary.visualOnly).toBe(true);
    expect(demoVisualAssetManifest.renderer).toBe("three-webgpu");
  });

  it("builds a visual asset manifest from BioCity scene assets", () => {
    const manifest = createVisualAssetManifestFromScene(bioCityDemoScene);
    const summary = summarizeVisualAssetManifest(manifest);

    expect(summary.assetCount).toBe(2);
    expect(summary.gltfCount).toBe(2);
    expect(manifest.assets.map((asset) => asset.id)).toEqual([
      "rain-market-streetscape",
      "bus-stop-shelter",
    ]);
    expect(manifest.assets[0].calibration).toMatchObject({
      origin: "scene-anchor",
      unitScaleMeters: 1,
      upAxis: "y-up",
      verified: true,
    });
    expect(manifest.assets.every((asset) => asset.collisionMode === "none")).toBe(true);
  });

  it("documents the SketchUp to GLB import path as visual-only", () => {
    const plan = createSketchUpImportPlan();

    expect(plan.acceptedInputFormats).toContain("skp");
    expect(plan.outputFormat).toBe("glb");
    expect(plan.collisionPolicy).toBe("visual-only");
    expect(plan.steps.join(" ")).toContain(".csim.json");
  });

  it("rejects collision-driving or unsafe asset URLs", () => {
    expect(() =>
      createVisualAssetManifest([
        {
          anchor: { x: 0, y: 0, z: 0 },
          calibration: {
            origin: "scene-anchor",
            unitScaleMeters: 1,
            upAxis: "y-up",
            verified: false,
          },
          collisionMode: "none",
          id: "remote-asset",
          kind: "gltf-prop",
          scale: 1,
          sourceUrl: "https://example.com/asset.glb",
        },
      ]),
    ).toThrow("relative application route");
    expect(() =>
      createVisualAssetManifest([
        {
          anchor: { x: 0, y: 0, z: 0 },
          calibration: {
            origin: "scene-anchor",
            unitScaleMeters: 1,
            upAxis: "y-up",
            verified: false,
          },
          collisionMode: "none",
          id: "secret-asset",
          kind: "gltf-prop",
          scale: 1,
          sourceUrl: "/assets/asset-key-sk-secret_1234567890.glb",
        },
      ]),
    ).toThrow("secrets");
  });
});
