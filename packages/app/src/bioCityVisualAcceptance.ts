import type { CrowdSimScene } from "@crowdsim/scene-schema";
import {
  createBioCityAssetLoadPlans,
  summarizeBioCityAssetLoading,
} from "./bioCityModelAssets";
import { createBioCityRenderPlan } from "./bioCityRenderPlan";
import { createBioCityViewportOverlayPlan } from "./bioCityViewportOverlayPlan";
import { selectViewportAgentAnnotations } from "./simulationViewportOverlay";
import type { SimulationSnapshot } from "./simulationEngine";
import type { HeatmapCell } from "./heatmap";

export type BioCityVisualAcceptanceItem = {
  blocksCompletion: boolean;
  completionPercent: number;
  evidence: string[];
  id:
    | "agent-annotations"
    | "model-imports"
    | "render-primitives"
    | "simulation-overlays"
    | "visual-lod"
    | "weather-effects";
  status: "complete" | "partial";
};

export type BioCityVisualAcceptanceAudit = {
  blocksCompletion: boolean;
  completeCount: number;
  completionPercent: number;
  itemCount: number;
  remainingBlockers: string[];
};

export function createBioCityVisualAcceptanceReport(
  scene: CrowdSimScene,
): BioCityVisualAcceptanceItem[] {
  const renderPlanAtRain = createBioCityRenderPlan(scene, 2100);
  const renderPlanAtHazard = createBioCityRenderPlan(scene, 1200);
  const assetSummary = summarizeBioCityAssetLoading(
    createBioCityAssetLoadPlans(renderPlanAtRain.assets),
  );
  const overlayPlan = createBioCityViewportOverlayPlan(scene, {
    elapsedSeconds: 1200,
    heatmapCells: createAcceptanceHeatmapCells(scene),
  });
  const agentAnnotations = selectViewportAgentAnnotations({
    scene,
    snapshot: createAcceptanceSnapshot(scene),
    viewMode: "3d",
  });

  return [
    createAcceptanceItem({
      complete:
        renderPlanAtRain.assets.length > 0 &&
        scene.visualAssets.some((asset) => asset.originalSourceFormat === "sketchup") &&
        scene.visualAssets.every((asset) => asset.calibration.verified),
      evidence: [
        `visualAssets=${scene.visualAssets.length}`,
        `gltfAssets=${assetSummary.gltfCount}`,
        `verifiedCalibration=${scene.visualAssets.filter((asset) => asset.calibration.verified).length}`,
      ],
      id: "model-imports",
    }),
    createAcceptanceItem({
      complete:
        assetSummary.estimatedTriangles > 0 &&
        renderPlanAtRain.assets.some(
          (asset) => Object.keys(asset.lodSources).length > 0,
        ),
      evidence: [
        `lod low/medium/high=${assetSummary.lowLodCount}/${assetSummary.mediumLodCount}/${assetSummary.highLodCount}`,
        `uniqueSources=${assetSummary.uniqueSourceCount}`,
        `estimatedTriangles=${assetSummary.estimatedTriangles}`,
      ],
      id: "visual-lod",
    }),
    createAcceptanceItem({
      complete: ["road", "building", "transitStop", "obstacle", "hazard"].every(
        (kind) =>
          renderPlanAtHazard.primitives.some((primitive) => primitive.kind === kind),
      ),
      evidence: [
        `primitives=${renderPlanAtHazard.primitives.length}`,
        `assets=${renderPlanAtHazard.assets.length}`,
        `activeHazards=${renderPlanAtHazard.primitives.filter((primitive) => primitive.kind === "hazard").length}`,
      ],
      id: "render-primitives",
    }),
    createAcceptanceItem({
      complete:
        renderPlanAtRain.weather.precipitationIntensity > 0 &&
        renderPlanAtRain.weather.rainStreaks.length > 0 &&
        renderPlanAtRain.weather.windIndicators.length > 0,
      evidence: [
        `weather=${renderPlanAtRain.weather.condition}`,
        `rainStreaks=${renderPlanAtRain.weather.rainStreaks.length}`,
        `windIndicators=${renderPlanAtRain.weather.windIndicators.length}`,
        `fogOpacity=${renderPlanAtRain.weather.fogOpacity}`,
      ],
      id: "weather-effects",
    }),
    createAcceptanceItem({
      complete:
        overlayPlan.heatmap.length > 0 &&
        overlayPlan.flows.length > 0 &&
        overlayPlan.risks.some((risk) => risk.active),
      evidence: [
        `heatmapCells=${overlayPlan.summary.heatmapCellCount}`,
        `flows=${overlayPlan.summary.flowCount}`,
        `activeRisks=${overlayPlan.summary.activeRiskCount}`,
        `peakHeatmap=${overlayPlan.summary.peakHeatmapIntensity}`,
      ],
      id: "simulation-overlays",
    }),
    createAcceptanceItem({
      complete:
        agentAnnotations.length > 0 &&
        agentAnnotations.every(
          (agent) =>
            agent.leftPercent >= 4 &&
            agent.leftPercent <= 96 &&
            agent.topPercent >= 4 &&
            agent.topPercent <= 96,
        ),
      evidence: [
        `annotations=${agentAnnotations.length}`,
        `firstIntent=${agentAnnotations[0]?.intent ?? "none"}`,
        "projection=3d-pseudo-isometric",
      ],
      id: "agent-annotations",
    }),
  ];
}

export function createBioCityVisualAcceptanceAudit(
  report: readonly BioCityVisualAcceptanceItem[],
): BioCityVisualAcceptanceAudit {
  const completeCount = report.filter((item) => item.status === "complete").length;
  const remainingBlockers = report
    .filter((item) => item.blocksCompletion || item.status !== "complete")
    .map((item) => item.id);

  return {
    blocksCompletion: remainingBlockers.length > 0,
    completeCount,
    completionPercent:
      report.length > 0
        ? Math.round(
            report.reduce((sum, item) => sum + item.completionPercent, 0) /
              report.length,
          )
        : 0,
    itemCount: report.length,
    remainingBlockers,
  };
}

function createAcceptanceItem({
  complete,
  evidence,
  id,
}: {
  complete: boolean;
  evidence: string[];
  id: BioCityVisualAcceptanceItem["id"];
}): BioCityVisualAcceptanceItem {
  return {
    blocksCompletion: !complete,
    completionPercent: complete ? 100 : 60,
    evidence,
    id,
    status: complete ? "complete" : "partial",
  };
}

function createAcceptanceHeatmapCells(scene: CrowdSimScene): HeatmapCell[] {
  return [
    {
      count: 32,
      height: 4,
      id: "acceptance-peak",
      intensity: 1,
      width: 4,
      x: scene.world.width * 0.58,
      y: scene.world.height * 0.58,
    },
    {
      count: 14,
      height: 4,
      id: "acceptance-mid",
      intensity: 0.44,
      width: 4,
      x: scene.world.width * 0.32,
      y: scene.world.height * 0.52,
    },
  ];
}

function createAcceptanceSnapshot(scene: CrowdSimScene): SimulationSnapshot {
  return {
    agentCount: 4,
    agents: [
      createAcceptanceAgent(1, scene.world.width * 0.42, scene.world.height * 0.58),
      createAcceptanceAgent(2, scene.world.width * 0.5, scene.world.height * 0.62),
      createAcceptanceAgent(3, scene.world.width * 0.6, scene.world.height * 0.56),
      createAcceptanceAgent(4, scene.world.width * 0.67, scene.world.height * 0.66),
    ],
    elapsedSeconds: 1200,
    exitedCount: 0,
    spawnedCount: 4,
    status: "running",
    stepCount: 1,
    timeScale: 1,
  };
}

function createAcceptanceAgent(id: number, x: number, y: number) {
  return {
    id,
    lifecycleState: id === 1 ? ("queue" as const) : ("walk" as const),
    targetX: x,
    targetY: y,
    vx: 0,
    vy: 0,
    x,
    y,
  };
}
