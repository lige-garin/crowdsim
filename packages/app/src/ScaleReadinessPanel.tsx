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
import { createMultiFloorScene, summarizeMultiFloorScene } from "./multifloorScene";
import { createPhotorealisticTilesConfig } from "./photorealisticTiles";
import {
  canAttemptHalfMillionAgents,
  createIndirectDrawPlan,
  estimateScaleBudget,
} from "./scaleBudget";
import { useI18n } from "./i18n";
import { demoVisualAssetManifest } from "./visualAssets";

export function ScaleReadinessPanel() {
  const { language } = useI18n();
  const summary = useMemo(() => {
    const multiFloor = createMultiFloorScene({
      connectors: [
        {
          fromFloorId: "level-1",
          id: "stairs-1",
          kind: "stairs",
          position: { x: 20, y: 20 },
          toFloorId: "level-2",
        },
      ],
      floors: [
        { elevationMeters: 0, id: "level-1", name: "Level 1", scene: demoScene },
        {
          elevationMeters: 4,
          id: "level-2",
          name: "Level 2",
          scene: { ...demoScene, id: "atrium-level-2", name: "Atrium Level 2" },
        },
      ],
      id: "scale-readiness-stack",
      name: "Scale readiness stack",
    });
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
      canAttempt: canAttemptHalfMillionAgents(budget),
      demoPlan,
      demoReady: validateDemoModePlan(demoPlan).ready,
      indirectDraw,
      multiFloor: summarizeMultiFloorScene(multiFloor),
    };
  }, []);
  const title = language === "zh" ? "规模就绪" : "Scale readiness";
  const floorsLabel = language === "zh" ? "楼层" : "floors";
  const agentsLabel = language === "zh" ? "50万 agent" : "500k agents";

  return (
    <section className="probe-panel" aria-label={title}>
      <h3>{title}</h3>
      <p>
        {summary.multiFloor.floorCount} {floorsLabel} | {agentsLabel}
      </p>
      <code>
        {summary.budget.renderStrategy} | {summary.budget.estimatedAgentMemoryMegabytes}{" "}
        MB | {summary.canAttempt ? "ready" : "blocked"}
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
        indirect {summary.indirectDraw.mode} | batches {summary.indirectDraw.batchCount}{" "}
        | args {summary.indirectDraw.argsBufferBytes} B
      </code>
    </section>
  );
}
