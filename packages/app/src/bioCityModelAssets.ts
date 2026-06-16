import type { CrowdSimScene } from "@crowdsim/scene-schema";
import type { Object3D } from "three";
import type { BioCityRenderAssetPlacement } from "./bioCityRenderPlan";

export type BioCityAssetLoadPlan = {
  fallback: "placeholder";
  id: string;
  loader: "gltf-loader" | "tileset-renderer";
  sourceUrl: string;
};

export type BioCityAssetLoadingReport = {
  assetCount: number;
  fallbackCount: number;
  gltfCount: number;
  tilesetCount: number;
  uniqueSourceCount: number;
};

const gltfSceneCache = new Map<string, Promise<Object3D | undefined>>();

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

export function summarizeBioCityAssetLoading(
  plans: readonly BioCityAssetLoadPlan[],
): BioCityAssetLoadingReport {
  return {
    assetCount: plans.length,
    fallbackCount: plans.filter((plan) => plan.fallback === "placeholder").length,
    gltfCount: plans.filter((plan) => plan.loader === "gltf-loader").length,
    tilesetCount: plans.filter((plan) => plan.loader === "tileset-renderer").length,
    uniqueSourceCount: new Set(plans.map((plan) => plan.sourceUrl)).size,
  };
}

export async function loadBioCityVisualAssetObject(
  asset: BioCityRenderAssetPlacement,
  scene: CrowdSimScene,
): Promise<Object3D | undefined> {
  const plan = createBioCityAssetLoadPlan(asset);

  if (plan.loader !== "gltf-loader") {
    return undefined;
  }

  const cachedScene = await loadCachedGltfScene(asset.sourceUrl);

  if (!cachedScene) {
    return undefined;
  }

  const object = cachedScene.clone(true);

  object.name = `${asset.id}-model`;
  object.position.set(
    asset.anchor.x - scene.world.width / 2,
    scene.world.height / 2 - asset.anchor.y,
    asset.anchor.z,
  );
  object.rotation.z = (asset.rotationDegrees * Math.PI) / 180;
  object.scale.setScalar(asset.scale);

  return object;
}

async function loadCachedGltfScene(sourceUrl: string) {
  const existing = gltfSceneCache.get(sourceUrl);

  if (existing) {
    return existing;
  }

  const pending = import("three/examples/jsm/loaders/GLTFLoader.js")
    .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(sourceUrl))
    .then((gltf) => gltf.scene)
    .catch(() => undefined);

  gltfSceneCache.set(sourceUrl, pending);

  return pending;
}
