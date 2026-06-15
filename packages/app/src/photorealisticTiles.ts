import { redactSecret } from "./apiKeySafety";

export type GeoAnchor = {
  altitudeMeters?: number;
  latitude: number;
  longitude: number;
};

export type PhotorealisticTilesConfig = {
  anchor: Required<GeoAnchor>;
  attribution: string;
  enabled: boolean;
  provider: "google-photorealistic-3d-tiles";
  proxyUrl: string;
};

export type TilesRendererIntegrationPlan = {
  cameraSync: readonly ["setCamera", "setResolutionFromRenderer"];
  collisionGeometry: ".csim.json";
  dynamicImport: "import('3d-tiles-renderer')";
  moduleName: "3d-tiles-renderer";
  renderLoopHook: "tilesRenderer.update";
  renderer: "Three.WebGPURenderer";
  rootTilesetUrl: string;
  runtimeAdapter: "createTilesRendererRuntime";
  visualOnly: true;
};

export type TilesRendererLike = {
  dispose?: () => void;
  setCamera: (camera: unknown) => void;
  setResolutionFromRenderer: (camera: unknown, renderer: unknown) => void;
  update: () => void;
};

export type TilesRendererModuleLike = {
  TilesRenderer: new (rootTilesetUrl: string) => TilesRendererLike;
};

export type TilesRendererFrame = {
  camera: unknown;
  renderer: unknown;
};

export type TilesRendererRuntime = {
  collisionGeometry: ".csim.json";
  dispose: () => void;
  rootTilesetUrl: string;
  syncFrame: (frame: TilesRendererFrame) => void;
  tilesRenderer: TilesRendererLike;
  visualOnly: true;
};

export function createPhotorealisticTilesConfig(options: {
  anchor: GeoAnchor;
  enabled?: boolean;
  proxyBaseUrl: string;
}): PhotorealisticTilesConfig {
  if (!Number.isFinite(options.anchor.latitude)) {
    throw new Error("Tiles anchor latitude must be finite");
  }

  if (!Number.isFinite(options.anchor.longitude)) {
    throw new Error("Tiles anchor longitude must be finite");
  }

  return {
    anchor: {
      altitudeMeters: options.anchor.altitudeMeters ?? 0,
      latitude: options.anchor.latitude,
      longitude: options.anchor.longitude,
    },
    attribution:
      "Visual basemap only; simulation collision geometry remains .csim.json.",
    enabled: options.enabled ?? true,
    provider: "google-photorealistic-3d-tiles",
    proxyUrl: normalizeProxyUrl(options.proxyBaseUrl),
  };
}

export function assertTilesConfigHasNoClientSecret(config: PhotorealisticTilesConfig) {
  const serialized = JSON.stringify(config);

  if (serialized !== redactSecret(serialized)) {
    throw new Error("Tiles config must not expose API keys or secret tokens");
  }
}

export function createGeoAnchoredSceneId(sceneId: string, anchor: GeoAnchor) {
  return `${sceneId}@${anchor.latitude.toFixed(5)},${anchor.longitude.toFixed(5)}`;
}

export function createTilesRendererIntegrationPlan(
  config: PhotorealisticTilesConfig,
): TilesRendererIntegrationPlan {
  assertTilesConfigHasNoClientSecret(config);

  if (!config.proxyUrl.startsWith("/")) {
    throw new Error("Tiles renderer plan requires a relative proxy URL");
  }

  return {
    cameraSync: ["setCamera", "setResolutionFromRenderer"],
    collisionGeometry: ".csim.json",
    dynamicImport: "import('3d-tiles-renderer')",
    moduleName: "3d-tiles-renderer",
    renderLoopHook: "tilesRenderer.update",
    renderer: "Three.WebGPURenderer",
    rootTilesetUrl: `${config.proxyUrl}/tileset.json`,
    runtimeAdapter: "createTilesRendererRuntime",
    visualOnly: true,
  };
}

export async function loadTilesRendererRuntime(
  plan: TilesRendererIntegrationPlan,
  importTilesRenderer: () => Promise<TilesRendererModuleLike>,
) {
  return createTilesRendererRuntime(plan, await importTilesRenderer());
}

export function createTilesRendererRuntime(
  plan: TilesRendererIntegrationPlan,
  module: TilesRendererModuleLike,
): TilesRendererRuntime {
  const tilesRenderer = new module.TilesRenderer(plan.rootTilesetUrl);

  return {
    collisionGeometry: plan.collisionGeometry,
    dispose: () => {
      tilesRenderer.dispose?.();
    },
    rootTilesetUrl: plan.rootTilesetUrl,
    syncFrame: (frame) => {
      tilesRenderer.setCamera(frame.camera);
      tilesRenderer.setResolutionFromRenderer(frame.camera, frame.renderer);
      tilesRenderer.update();
    },
    tilesRenderer,
    visualOnly: plan.visualOnly,
  };
}

function normalizeProxyUrl(proxyBaseUrl: string) {
  const url = proxyBaseUrl.trim();

  if (!url.startsWith("/")) {
    throw new Error("Tiles proxy URL must be a relative backend route");
  }

  return url.replace(/\/+$/, "");
}
