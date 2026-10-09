import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";

// Two localStorage copies can exist (project + editor autosave). Base64 adds
// one third, so 1.5 MB leaves room inside the common 5 MB origin quota.
export const maxEmbeddedGlbBytes = 1_500_000;

export function embeddedGlbBytes(scene: CrowdSimScene) {
  return scene.visualAssets.reduce((total, asset) => {
    const base64 = asset.sourceUrl.match(/^data:[^;,]*;base64,(.*)$/)?.[1];
    if (!base64) return total;
    return (
      total +
      Math.floor((base64.length * 3) / 4) -
      (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0)
    );
  }, 0);
}

export function fitsEmbeddedGlbBudget(scene: CrowdSimScene, additionalBytes: number) {
  return embeddedGlbBytes(scene) + additionalBytes <= maxEmbeddedGlbBytes;
}

export function addGlbVisualAsset(
  scene: CrowdSimScene,
  fileName: string,
  sourceUrl: string,
): CrowdSimScene {
  const stem = fileName.replace(/\.glb$/i, "").replace(/[^a-z0-9_-]+/gi, "-");

  return parseScene({
    ...scene,
    visualAssets: [
      ...scene.visualAssets,
      {
        id: `uploaded-${stem || "model"}-${scene.visualAssets.length + 1}`,
        name: fileName,
        kind: "gltf-scene",
        sourceUrl,
        originalSourceFormat: "glb",
        anchor: { x: scene.world.width / 2, y: scene.world.height / 2, z: 0 },
        calibration: {
          origin: "scene-anchor",
          unitScaleMeters: 1,
          upAxis: "y-up",
          verified: false,
        },
        customParameters: { uploadedByUser: true },
      },
    ],
    customParameters: {
      ...scene.customParameters,
      modelGeometryReview: {
        wallsConfirmed: false,
        entrancesConfirmed: false,
        walkableAreaConfirmed: false,
      },
    },
  });
}

export function normalizeGlbDataUrl(sourceUrl: string) {
  return sourceUrl.replace(/^data:[^;,]*(;base64,)/, "data:model/gltf-binary$1");
}

export function modelGeometryReview(scene: CrowdSimScene) {
  const review = scene.customParameters.modelGeometryReview as
    | Record<string, unknown>
    | undefined;

  return {
    wallsConfirmed: review?.wallsConfirmed === true,
    entrancesConfirmed: review?.entrancesConfirmed === true,
    walkableAreaConfirmed: review?.walkableAreaConfirmed === true,
  };
}
