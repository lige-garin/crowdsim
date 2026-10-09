import { describe, expect, it } from "vitest";
import { parseScene } from "@crowdsim/scene-schema";
import {
  addGlbVisualAsset,
  embeddedGlbBytes,
  fitsEmbeddedGlbBudget,
  maxEmbeddedGlbBytes,
  modelGeometryReview,
  normalizeGlbDataUrl,
} from "./glbImport";

describe("addGlbVisualAsset", () => {
  it("embeds a model at the world centre and starts an unconfirmed review", () => {
    const scene = addGlbVisualAsset(
      parseScene({
        schemaVersion: "1.0.0",
        id: "glb-test",
        name: "GLB test",
        world: { width: 40, height: 20 },
      }),
      "my mall.glb",
      "data:model/gltf-binary;base64,AAAA",
    );

    expect(scene.visualAssets[0]).toMatchObject({
      anchor: { x: 20, y: 10, z: 0 },
      name: "my mall.glb",
      sourceUrl: "data:model/gltf-binary;base64,AAAA",
    });
    expect(modelGeometryReview(scene)).toEqual({
      wallsConfirmed: false,
      entrancesConfirmed: false,
      walkableAreaConfirmed: false,
    });
  });

  it("normalizes browser MIME guesses to the embedded GLB contract", () => {
    expect(normalizeGlbDataUrl("data:application/octet-stream;base64,AAAA")).toBe(
      "data:model/gltf-binary;base64,AAAA",
    );
  });

  it("counts embedded bytes so imports can stay inside the local save budget", () => {
    const scene = addGlbVisualAsset(
      parseScene({
        schemaVersion: "1.0.0",
        id: "glb-size",
        name: "GLB size",
        world: { width: 10, height: 10 },
      }),
      "tiny.glb",
      "data:model/gltf-binary;base64,AAAA",
    );

    expect(embeddedGlbBytes(scene)).toBe(3);
    expect(maxEmbeddedGlbBytes).toBe(1_500_000);
    expect(fitsEmbeddedGlbBudget(scene, maxEmbeddedGlbBytes - 3)).toBe(true);
    expect(fitsEmbeddedGlbBudget(scene, maxEmbeddedGlbBytes - 2)).toBe(false);
  });
});
