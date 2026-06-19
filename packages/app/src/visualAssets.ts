import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { redactSecret } from "./apiKeySafety";

export type VisualAssetKind = "gltf-scene" | "gltf-prop" | "tileset";

export type VisualAssetCalibration = {
  origin: "base-center" | "scene-anchor" | "source-origin";
  simulationProxy?: {
    entityId: string;
    kind: "area" | "building" | "obstacle" | "road" | "transitStop";
    role: "alignment-only" | "footprint-source";
  };
  unitScaleMeters: number;
  upAxis: "y-up" | "z-up";
  verified: boolean;
};

export type VisualAssetManifestItem = {
  anchor: {
    x: number;
    y: number;
    z: number;
  };
  calibration: VisualAssetCalibration;
  collisionMode: "none";
  id: string;
  kind: VisualAssetKind;
  lodSources: Partial<Record<"high" | "low" | "medium", string>>;
  scale: number;
  sourceUrl: string;
};

export type VisualAssetManifest = {
  assets: readonly VisualAssetManifestItem[];
  collisionPolicy: "visual-only";
  renderer: "three-webgpu";
};

export type SketchUpImportPlan = {
  acceptedInputFormats: readonly ["skp", "dae", "obj"];
  collisionPolicy: "visual-only";
  outputFormat: "glb";
  steps: readonly string[];
  texturePolicy: "local-app-route";
};

export function createVisualAssetManifest(
  assets: readonly VisualAssetManifestItem[],
): VisualAssetManifest {
  for (const asset of assets) {
    validateVisualAsset(asset);
  }

  return {
    assets: assets.map((asset) => ({
      ...asset,
      anchor: { ...asset.anchor },
      calibration: {
        ...asset.calibration,
        simulationProxy: asset.calibration.simulationProxy
          ? { ...asset.calibration.simulationProxy }
          : undefined,
      },
    })),
    collisionPolicy: "visual-only",
    renderer: "three-webgpu",
  };
}

export function createVisualAssetManifestFromScene(
  scene: CrowdSimScene,
): VisualAssetManifest {
  return createVisualAssetManifest(
    scene.visualAssets
      .filter((asset) => asset.visible)
      .map((asset) => ({
        anchor: { ...asset.anchor },
        calibration: {
          origin: asset.calibration.origin,
          simulationProxy: asset.calibration.simulationProxy
            ? { ...asset.calibration.simulationProxy }
            : undefined,
          unitScaleMeters: asset.calibration.unitScaleMeters,
          upAxis: asset.calibration.upAxis,
          verified: asset.calibration.verified,
        },
        collisionMode: asset.collisionMode,
        id: asset.id,
        kind: asset.kind,
        lodSources: { ...asset.lodSources },
        scale: asset.scale,
        sourceUrl: asset.sourceUrl,
      })),
  );
}

export function summarizeVisualAssetManifest(manifest: VisualAssetManifest) {
  return {
    assetCount: manifest.assets.length,
    gltfCount: manifest.assets.filter((asset) => asset.kind.startsWith("gltf")).length,
    tilesetCount: manifest.assets.filter((asset) => asset.kind === "tileset").length,
    visualOnly: manifest.collisionPolicy === "visual-only",
  };
}

export function createSketchUpImportPlan(): SketchUpImportPlan {
  return {
    acceptedInputFormats: ["skp", "dae", "obj"],
    collisionPolicy: "visual-only",
    outputFormat: "glb",
    steps: [
      "Export or convert SketchUp geometry to glTF/GLB before browser import.",
      "Store the GLB and textures under an application asset route.",
      "Register the model as a scene visualAsset with collisionMode none.",
      "Author walkable roads, obstacles, and hazards separately in .csim.json.",
    ],
    texturePolicy: "local-app-route",
  };
}

export const demoVisualAssetManifest = createVisualAssetManifest([
  {
    anchor: { x: 12, y: 8, z: 0 },
    calibration: defaultVisualAssetCalibration(),
    collisionMode: "none",
    id: "wayfinding-kiosk",
    kind: "gltf-prop",
    lodSources: {},
    scale: 1,
    sourceUrl: "/assets/showcase/wayfinding-kiosk.glb",
  },
  {
    anchor: { x: 40, y: 24, z: 0 },
    calibration: defaultVisualAssetCalibration(),
    collisionMode: "none",
    id: "atrium-shell",
    kind: "gltf-scene",
    lodSources: {},
    scale: 1,
    sourceUrl: "/assets/showcase/atrium-shell.gltf",
  },
]);

function defaultVisualAssetCalibration(): VisualAssetCalibration {
  return {
    origin: "scene-anchor",
    unitScaleMeters: 1,
    upAxis: "y-up",
    verified: false,
  };
}

function validateVisualAsset(asset: VisualAssetManifestItem) {
  if (!/^[a-z0-9_-]+$/i.test(asset.id)) {
    throw new Error("Visual asset id must be stable and URL-safe");
  }

  if (asset.collisionMode !== "none") {
    throw new Error("Imported 3D assets are visual-only and cannot drive collision");
  }

  if (asset.calibration.unitScaleMeters <= 0) {
    throw new Error("Visual asset unit scale must be positive");
  }

  for (const sourceUrl of Object.values(asset.lodSources)) {
    if (sourceUrl === undefined) {
      continue;
    }

    validateVisualAssetUrl(sourceUrl);
  }

  if (asset.scale <= 0 || !Number.isFinite(asset.scale)) {
    throw new Error("Visual asset scale must be positive");
  }

  if (!asset.sourceUrl.startsWith("/")) {
    throw new Error("Visual asset URL must be a relative application route");
  }

  if (!/\.(gltf|glb|json)$/i.test(asset.sourceUrl)) {
    throw new Error("Visual asset URL must reference glTF, GLB, or tileset JSON");
  }

  if (asset.sourceUrl !== redactSecret(asset.sourceUrl)) {
    throw new Error("Visual asset URL must not expose secrets");
  }
}

function validateVisualAssetUrl(sourceUrl: string) {
  if (!sourceUrl.startsWith("/")) {
    throw new Error("Visual asset URL must be a relative application route");
  }

  if (!/\.(gltf|glb|json)$/i.test(sourceUrl)) {
    throw new Error("Visual asset URL must reference glTF, GLB, or tileset JSON");
  }

  if (sourceUrl !== redactSecret(sourceUrl)) {
    throw new Error("Visual asset URL must not expose secrets");
  }
}
