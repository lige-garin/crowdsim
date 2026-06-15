import type { StageViewMode } from "./AppTypes";
import type { PhotorealisticTilesConfig } from "./photorealisticTiles";
import type { VisualAssetManifest } from "./visualAssets";

export type DemoModeStepKind =
  | "activate-3d"
  | "enable-basemap"
  | "load-template"
  | "play-simulation"
  | "publish-share"
  | "show-network";

export type DemoModeStep = {
  id: string;
  kind: DemoModeStepKind;
  label: string;
};

export type DemoModePlan = {
  estimatedDurationSeconds: number;
  id: string;
  initialViewMode: StageViewMode;
  steps: readonly DemoModeStep[];
  tilesProxyUrl: string;
  visualAssetCount: number;
};

export type DemoModeValidation = {
  missingKinds: DemoModeStepKind[];
  ready: boolean;
};

const requiredDemoKinds: readonly DemoModeStepKind[] = [
  "load-template",
  "activate-3d",
  "enable-basemap",
  "play-simulation",
  "show-network",
  "publish-share",
];

export function createOneClickDemoModePlan(options: {
  assetManifest: VisualAssetManifest;
  id?: string;
  templateId: string;
  tilesConfig: PhotorealisticTilesConfig;
}): DemoModePlan {
  return {
    estimatedDurationSeconds: 90,
    id: options.id ?? "v2-city-demo",
    initialViewMode: "3d",
    steps: [
      {
        id: "load-template",
        kind: "load-template",
        label: `Load ${options.templateId}`,
      },
      {
        id: "activate-3d",
        kind: "activate-3d",
        label: "Switch to polished 3D view",
      },
      {
        id: "enable-basemap",
        kind: "enable-basemap",
        label: `Enable ${options.tilesConfig.provider}`,
      },
      {
        id: "play-simulation",
        kind: "play-simulation",
        label: "Start evacuation playback",
      },
      {
        id: "show-network",
        kind: "show-network",
        label: "Reveal contact network links",
      },
      {
        id: "publish-share",
        kind: "publish-share",
        label: "Open read-only share route",
      },
    ],
    tilesProxyUrl: options.tilesConfig.proxyUrl,
    visualAssetCount: options.assetManifest.assets.length,
  };
}

export function validateDemoModePlan(plan: DemoModePlan): DemoModeValidation {
  const kinds = new Set(plan.steps.map((step) => step.kind));
  const missingKinds = requiredDemoKinds.filter((kind) => !kinds.has(kind));

  return {
    missingKinds,
    ready:
      missingKinds.length === 0 &&
      plan.initialViewMode === "3d" &&
      plan.tilesProxyUrl.startsWith("/") &&
      plan.visualAssetCount > 0,
  };
}
