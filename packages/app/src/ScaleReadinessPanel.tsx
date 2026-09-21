import { useMemo } from "react";
import {
  createAgentSoA,
  createFlowFieldAtlasCpu,
  createFlowFieldCpu,
  createSpatialHashGridLayout,
  estimateFlowFieldAtlasBytes,
  sampleFlowFieldAtlasCpu,
  setAgentPosition,
  setAgentTargetField,
} from "@crowdsim/core-gpu";
import { createOneClickDemoModePlan, validateDemoModePlan } from "./demoMode";
import { demoScene } from "./demoScene";
import { createPhotorealisticTilesConfig } from "./photorealisticTiles";
import {
  createIndirectDrawPlan,
  estimateScaleBudget,
  projectHalfMillionAgentBudget,
} from "./scaleBudget";
import { useI18n } from "./i18n";
import { demoVisualAssetManifest } from "./visualAssets";

export function ScaleReadinessPanel() {
  const { language } = useI18n();
  const summary = useMemo(() => {
    const budget = estimateScaleBudget({ agentCount: 500_000 });
    const flowLayout = createSpatialHashGridLayout({
      cellSize: 4,
      height: demoScene.world.height,
      width: demoScene.world.width,
    });
    const flowAtlas = createFlowFieldAtlasCpu([
      createFlowFieldCpu({ layout: flowLayout, targetCell: flowLayout.columns - 1 }),
      createFlowFieldCpu({
        layout: flowLayout,
        targetCell: flowLayout.cellCount - flowLayout.columns,
      }),
    ]);
    const atlasProbeAgents = createAgentSoA(2);
    const indirectDraw = createIndirectDrawPlan(budget.agentCount);
    const demoPlan = createOneClickDemoModePlan({
      assetManifest: demoVisualAssetManifest,
      templateId: "stadium-concourse",
      tilesConfig: createPhotorealisticTilesConfig({
        anchor: { latitude: 31.2304, longitude: 121.4737 },
        proxyBaseUrl: "/api/tiles/google",
      }),
    });

    setAgentPosition(atlasProbeAgents, 0, 4, 4);
    setAgentTargetField(atlasProbeAgents, 0, 0);
    setAgentPosition(atlasProbeAgents, 1, 4, 4);
    setAgentTargetField(atlasProbeAgents, 1, 1);

    return {
      atlasBytes: estimateFlowFieldAtlasBytes(flowAtlas),
      atlasFields: flowAtlas.fieldCount,
      atlasRouted:
        sampleFlowFieldAtlasCpu(atlasProbeAgents, flowAtlas)[0] !==
        sampleFlowFieldAtlasCpu(atlasProbeAgents, flowAtlas)[2],
      budget,
      demoPlan,
      demoReady: validateDemoModePlan(demoPlan).ready,
      indirectDraw,
      projection: projectHalfMillionAgentBudget(budget),
    };
  }, []);
  const title = language === "zh" ? "规模投影" : "Scale projection";
  const agentsLabel = language === "zh" ? "50万 agent" : "500k agents";
  const projectionNote =
    language === "zh"
      ? "以下为预算推算，未在任何设备上实测。"
      : "Budget arithmetic below; never measured on any device.";

  return (
    <section className="probe-panel" aria-label={title}>
      <h3>{title}</h3>
      <p>{agentsLabel}</p>
      <p>{projectionNote}</p>
      <code>
        {summary.budget.renderStrategy} | {summary.budget.estimatedAgentMemoryMegabytes}{" "}
        MB | 500k {summary.projection.projection} ({summary.projection.measurement})
      </code>
      <code>
        demo {summary.demoPlan.steps.length} steps | assets{" "}
        {summary.demoPlan.visualAssetCount} | {summary.demoReady ? "ready" : "blocked"}
      </code>
      <code>
        flow atlas {summary.atlasFields} fields | targetField{" "}
        {summary.atlasRouted ? "routed" : "flat"} |{" "}
        {Math.round(summary.atlasBytes / 1024)} KB
      </code>
      <code>
        indirect {summary.indirectDraw.mode} (no renderer wired) | batches{" "}
        {summary.indirectDraw.batchCount} | args {summary.indirectDraw.argsBufferBytes}{" "}
        B
      </code>
    </section>
  );
}
