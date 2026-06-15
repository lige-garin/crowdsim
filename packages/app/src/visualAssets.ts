import { redactSecret } from "./apiKeySafety";

export type VisualAssetKind = "gltf-scene" | "gltf-prop" | "tileset";

export type VisualAssetManifestItem = {
  anchor: {
    x: number;
    y: number;
    z: number;
  };
  collisionMode: "none";
  id: string;
  kind: VisualAssetKind;
  scale: number;
  sourceUrl: string;
};

export type VisualAssetManifest = {
  assets: readonly VisualAssetManifestItem[];
  collisionPolicy: "visual-only";
  renderer: "three-webgpu";
};

export function createVisualAssetManifest(
  assets: readonly VisualAssetManifestItem[],
): VisualAssetManifest {
  for (const asset of assets) {
    validateVisualAsset(asset);
  }

  return {
    assets: assets.map((asset) => ({ ...asset, anchor: { ...asset.anchor } })),
    collisionPolicy: "visual-only",
    renderer: "three-webgpu",
  };
}

export function summarizeVisualAssetManifest(manifest: VisualAssetManifest) {
  return {
    assetCount: manifest.assets.length,
    gltfCount: manifest.assets.filter((asset) => asset.kind.startsWith("gltf")).length,
    tilesetCount: manifest.assets.filter((asset) => asset.kind === "tileset").length,
    visualOnly: manifest.collisionPolicy === "visual-only",
  };
}

export const demoVisualAssetManifest = createVisualAssetManifest([
  {
    anchor: { x: 12, y: 8, z: 0 },
    collisionMode: "none",
    id: "wayfinding-kiosk",
    kind: "gltf-prop",
    scale: 1,
    sourceUrl: "/assets/showcase/wayfinding-kiosk.glb",
  },
  {
    anchor: { x: 40, y: 24, z: 0 },
    collisionMode: "none",
    id: "atrium-shell",
    kind: "gltf-scene",
    scale: 1,
    sourceUrl: "/assets/showcase/atrium-shell.gltf",
  },
]);

function validateVisualAsset(asset: VisualAssetManifestItem) {
  if (!/^[a-z0-9_-]+$/i.test(asset.id)) {
    throw new Error("Visual asset id must be stable and URL-safe");
  }

  if (asset.collisionMode !== "none") {
    throw new Error("Imported 3D assets are visual-only and cannot drive collision");
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
