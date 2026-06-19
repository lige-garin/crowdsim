import { useMemo } from "react";
import { bioCityDemoScene } from "./bioCityDemoScene";
import {
  createBioCityAssetLoadPlans,
  summarizeBioCityAssetLoading,
} from "./bioCityModelAssets";
import { createBioCityRenderPlan } from "./bioCityRenderPlan";
import { useI18n } from "./i18n";
import {
  assertTilesConfigHasNoClientSecret,
  createPhotorealisticTilesConfig,
  createTilesRendererIntegrationPlan,
} from "./photorealisticTiles";
import { demoVisualAssetManifest, summarizeVisualAssetManifest } from "./visualAssets";

export function TilesBackdropPanel() {
  const { language } = useI18n();
  const summary = useMemo(() => {
    const tilesConfig = createPhotorealisticTilesConfig({
      anchor: {
        latitude: 31.2304,
        longitude: 121.4737,
      },
      proxyBaseUrl: "/api/tiles/google",
    });

    assertTilesConfigHasNoClientSecret(tilesConfig);
    const bioCityAssetLoading = summarizeBioCityAssetLoading(
      createBioCityAssetLoadPlans(createBioCityRenderPlan(bioCityDemoScene).assets),
    );

    return {
      assets: summarizeVisualAssetManifest(demoVisualAssetManifest),
      bioCityAssetLoading,
      rendererPlan: createTilesRendererIntegrationPlan(tilesConfig),
      tilesConfig,
    };
  }, []);
  const title = language === "zh" ? "真实 3D 底图" : "Real 3D basemap";

  return (
    <section className="probe-panel" aria-label={title}>
      <h3>{title}</h3>
      <p>{summary.tilesConfig.attribution}</p>
      <code>
        {summary.tilesConfig.provider} | {summary.tilesConfig.proxyUrl}
      </code>
      <code>
        {summary.rendererPlan.moduleName} → {summary.rendererPlan.renderer} |{" "}
        {summary.rendererPlan.rootTilesetUrl}
      </code>
      <code>
        {summary.rendererPlan.cameraSync.join("/")} |{" "}
        {summary.rendererPlan.renderLoopHook} | collision{" "}
        {summary.rendererPlan.collisionGeometry} | visual-only{" "}
        {summary.rendererPlan.visualOnly && summary.assets.visualOnly ? "yes" : "no"}
      </code>
      <code>
        GLB assets {summary.bioCityAssetLoading.gltfCount} | unique URLs{" "}
        {summary.bioCityAssetLoading.uniqueSourceCount} | fallback{" "}
        {summary.bioCityAssetLoading.fallbackCount} placeholders
      </code>
      <code>
        LOD low/medium/high {summary.bioCityAssetLoading.lowLodCount}/
        {summary.bioCityAssetLoading.mediumLodCount}/
        {summary.bioCityAssetLoading.highLodCount} | budget{" "}
        {summary.bioCityAssetLoading.estimatedTriangles.toLocaleString()} tris
      </code>
    </section>
  );
}
