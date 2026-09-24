import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { Mesh, type Object3D } from "three";
import type { SceneRenderAssetPlacement } from "./sceneRenderPlan";

export type SceneAssetLod = "high" | "low" | "medium";

export type SceneAssetLoadPlan = {
  estimatedTriangles: number;
  fallback: "placeholder";
  id: string;
  loader: "gltf-loader" | "tileset-renderer";
  requestedLod: SceneAssetLod;
  selectedLod: SceneAssetLod;
  sourceUrl: string;
};

export type SceneAssetLoadingReport = {
  assetCount: number;
  deferredCount: number;
  estimatedTriangles: number;
  fallbackCount: number;
  gltfCount: number;
  highLodCount: number;
  lowLodCount: number;
  mediumLodCount: number;
  tilesetCount: number;
  uniqueSourceCount: number;
};

export type SceneAssetWorldTransform = {
  position: {
    x: number;
    y: number;
    z: number;
  };
  rotation: {
    x: number;
    y: number;
    z: number;
  };
  scale: number;
};

const gltfSceneCache = new Map<string, Promise<Object3D | undefined>>();

export type SceneAssetLoadOptions = {
  maxUniqueSources?: number;
  quality?: SceneAssetLod;
};

export function createSceneAssetLoadPlan(
  asset: SceneRenderAssetPlacement,
  options: SceneAssetLoadOptions = {},
): SceneAssetLoadPlan {
  const requestedLod = options.quality ?? "medium";
  const selectedLod = selectAssetLod(asset.lod, requestedLod);

  return {
    estimatedTriangles: estimateAssetTriangles(asset.kind, selectedLod),
    fallback: "placeholder",
    id: asset.id,
    loader: asset.kind === "tileset" ? "tileset-renderer" : "gltf-loader",
    requestedLod,
    selectedLod,
    sourceUrl: asset.lodSources[selectedLod] ?? asset.sourceUrl,
  };
}

export function createSceneAssetLoadPlans(
  assets: readonly SceneRenderAssetPlacement[],
  options: SceneAssetLoadOptions = {},
) {
  const seenSources = new Set<string>();

  return assets.map((asset) => {
    const plan = createSceneAssetLoadPlan(asset, options);

    if (
      options.maxUniqueSources !== undefined &&
      !seenSources.has(plan.sourceUrl) &&
      seenSources.size >= options.maxUniqueSources
    ) {
      return {
        ...plan,
        estimatedTriangles: 0,
        loader: "gltf-loader" as const,
        sourceUrl: "",
      };
    }

    if (plan.sourceUrl) {
      seenSources.add(plan.sourceUrl);
    }

    return plan;
  });
}

export function summarizeSceneAssetLoading(
  plans: readonly SceneAssetLoadPlan[],
): SceneAssetLoadingReport {
  return {
    assetCount: plans.length,
    deferredCount: plans.filter((plan) => plan.sourceUrl === "").length,
    estimatedTriangles: plans.reduce(
      (total, plan) => total + plan.estimatedTriangles,
      0,
    ),
    fallbackCount: plans.filter((plan) => plan.fallback === "placeholder").length,
    gltfCount: plans.filter((plan) => plan.loader === "gltf-loader").length,
    highLodCount: plans.filter((plan) => plan.selectedLod === "high").length,
    lowLodCount: plans.filter((plan) => plan.selectedLod === "low").length,
    mediumLodCount: plans.filter((plan) => plan.selectedLod === "medium").length,
    tilesetCount: plans.filter((plan) => plan.loader === "tileset-renderer").length,
    uniqueSourceCount: new Set(plans.map((plan) => plan.sourceUrl).filter(Boolean))
      .size,
  };
}

export function createSceneAssetWorldTransform(
  asset: SceneRenderAssetPlacement,
  scene: CrowdSimScene,
): SceneAssetWorldTransform {
  return {
    position: {
      x: asset.anchor.x - scene.world.width / 2,
      y: scene.world.height / 2 - asset.anchor.y,
      z: asset.anchor.z,
    },
    rotation: {
      x: asset.calibration.upAxis === "y-up" ? Math.PI / 2 : 0,
      y: 0,
      z: (asset.rotationDegrees * Math.PI) / 180,
    },
    scale: asset.scale * asset.calibration.unitScaleMeters,
  };
}

export async function loadSceneVisualAssetObject(
  asset: SceneRenderAssetPlacement,
  scene: CrowdSimScene,
): Promise<Object3D | undefined> {
  const plan = createSceneAssetLoadPlan(asset);

  if (plan.loader !== "gltf-loader" || plan.sourceUrl === "") {
    return undefined;
  }

  const cachedScene = await loadCachedGltfScene(plan.sourceUrl);

  if (!cachedScene) {
    return undefined;
  }

  const object = prepareSceneVisualAssetObject(cachedScene.clone(true));
  const transform = createSceneAssetWorldTransform(asset, scene);

  object.name = `${asset.id}-model`;
  object.position.set(transform.position.x, transform.position.y, transform.position.z);
  object.rotation.set(transform.rotation.x, transform.rotation.y, transform.rotation.z);
  object.scale.setScalar(transform.scale);

  return object;
}

/**
 * A placed copy that owns its geometry and materials, so disposing it never
 * frees resources shared with the loader cache.
 */
export function prepareSceneVisualAssetObject(object: Object3D) {
  object.traverse((child) => {
    if (!(child instanceof Mesh)) return;

    child.geometry = child.geometry.clone();
    child.material = Array.isArray(child.material)
      ? child.material.map((material) => material.clone())
      : child.material.clone();
  });

  return object;
}

function selectAssetLod(
  assetLod: SceneAssetLod,
  requestedLod: SceneAssetLod,
): SceneAssetLod {
  const rank: Record<SceneAssetLod, number> = {
    high: 3,
    low: 1,
    medium: 2,
  };

  return rank[assetLod] < rank[requestedLod] ? assetLod : requestedLod;
}

function estimateAssetTriangles(
  kind: SceneRenderAssetPlacement["kind"],
  lod: SceneAssetLod,
) {
  if (kind === "tileset") return 0;
  if (kind === "gltf-prop") {
    if (lod === "high") return 18_000;
    if (lod === "medium") return 7_500;
    return 2_400;
  }

  if (lod === "high") return 450_000;
  if (lod === "medium") return 120_000;

  return 28_000;
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
