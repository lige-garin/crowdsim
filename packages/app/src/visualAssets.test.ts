import { describe, expect, it } from "vitest";
import {
  createVisualAssetManifest,
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

  it("rejects collision-driving or unsafe asset URLs", () => {
    expect(() =>
      createVisualAssetManifest([
        {
          anchor: { x: 0, y: 0, z: 0 },
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
