import { describe, expect, it } from "vitest";
import { createOneClickDemoModePlan, validateDemoModePlan } from "./demoMode";
import { createPhotorealisticTilesConfig } from "./photorealisticTiles";
import { demoVisualAssetManifest } from "./visualAssets";

describe("one-click demo mode", () => {
  it("creates a complete V2 3D city demo plan", () => {
    const plan = createOneClickDemoModePlan({
      assetManifest: demoVisualAssetManifest,
      templateId: "stadium-concourse",
      tilesConfig: createPhotorealisticTilesConfig({
        anchor: { latitude: 31.2304, longitude: 121.4737 },
        proxyBaseUrl: "/api/tiles/google",
      }),
    });
    const validation = validateDemoModePlan(plan);

    expect(plan.initialViewMode).toBe("3d");
    expect(plan.steps.map((step) => step.kind)).toEqual([
      "load-template",
      "activate-3d",
      "enable-basemap",
      "play-simulation",
      "show-network",
      "publish-share",
    ]);
    expect(plan.visualAssetCount).toBe(2);
    expect(validation.ready).toBe(true);
    expect(validation.missingKinds).toEqual([]);
  });

  it("reports missing demo actions", () => {
    const validation = validateDemoModePlan({
      estimatedDurationSeconds: 30,
      id: "incomplete",
      initialViewMode: "2d",
      steps: [],
      tilesProxyUrl: "/api/tiles/google",
      visualAssetCount: 0,
    });

    expect(validation.ready).toBe(false);
    expect(validation.missingKinds).toContain("activate-3d");
    expect(validation.missingKinds).toContain("publish-share");
  });
});
