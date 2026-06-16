import type { CrowdSimScene } from "@crowdsim/scene-schema";
import type { Object3D } from "three";
import type { BioCityRenderAssetPlacement } from "./bioCityRenderPlan";

export type BioCityAssetLoadPlan = {
  fallback: "placeholder";
  id: string;
  loader: "gltf-loader" | "tileset-renderer";
  sourceUrl: string;
};

export function createBioCityAssetLoadPlan(
  asset: BioCityRenderAssetPlacement,
): BioCityAssetLoadPlan {
  return {
    fallback: "placeholder",
    id: asset.id,
    loader: asset.kind === "tileset" ? "tileset-renderer" : "gltf-loader",
    sourceUrl: asset.sourceUrl,
  };
}

export function createBioCityAssetLoadPlans(
  assets: readonly BioCityRenderAssetPlacement[],
) {
  return assets.map(createBioCityAssetLoadPlan);
}

export async function loadBioCityVisualAssetObject(
  asset: BioCityRenderAssetPlacement,
  scene: CrowdSimScene,
): Promise<Object3D | undefined> {
  const plan = createBioCityAssetLoadPlan(asset);

  if (plan.loader !== "gltf-loader") {
    return undefined;
  }

  try {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(asset.sourceUrl);
    const object = gltf.scene;

    object.name = `${asset.id}-model`;
    object.position.set(
      asset.anchor.x - scene.world.width / 2,
      scene.world.height / 2 - asset.anchor.y,
      asset.anchor.z,
    );
    object.rotation.z = (asset.rotationDegrees * Math.PI) / 180;
    object.scale.setScalar(asset.scale);

    return object;
  } catch {
    return undefined;
  }
}
