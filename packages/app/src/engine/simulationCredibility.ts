import type { CrowdSimScene } from "@crowdsim/scene-schema";
import type { DashboardStats } from "../analytics/dashboardStats";
import type { EvacuationState } from "../AppTypes";
import type { HeatmapSample } from "../analytics/heatmap";
import { simulationRuntimeProfile, type SimulationSnapshot } from "./simulationEngine";
import {
  createLiveSimulationRuntimeArtifact,
  formatSimulationRuntimeArtifact,
  type SimulationRuntimeArtifact,
} from "./simulationRuntimeArtifact";

export type SimulationCredibilityReport = {
  constraints: string;
  exportReplay: string;
  metricExplanation: string;
  riskNotes: string[];
  runtime: string;
  status: "limited" | "operational" | "warming-up";
};

export function createSimulationCredibilityReport(options: {
  dashboardStats: DashboardStats;
  evacuation: EvacuationState;
  heatmapSamples: readonly HeatmapSample[];
  scene: CrowdSimScene;
  simulationSnapshot: SimulationSnapshot;
  runtime?: Partial<SimulationRuntimeArtifact>;
}): SimulationCredibilityReport {
  const {
    dashboardStats,
    evacuation,
    heatmapSamples,
    runtime,
    scene,
    simulationSnapshot,
  } = options;
  const runtimeArtifact = createLiveSimulationRuntimeArtifact(runtime);
  const hasLiveSamples = heatmapSamples.length > 0;
  const atAgentLimit =
    simulationSnapshot.agentCount >= simulationRuntimeProfile.maxAgents;
  const status = atAgentLimit
    ? "limited"
    : hasLiveSamples
      ? "operational"
      : "warming-up";
  const latestSample = heatmapSamples.at(-1);
  const firstSample = heatmapSamples[0];
  const sampleWindowSeconds =
    latestSample && firstSample
      ? Math.max(0, latestSample.elapsedSeconds - firstSample.elapsedSeconds)
      : 0;
  const replayAgentCount = latestSample?.agents.length ?? 0;

  return {
    constraints: [
      `scene=${scene.id}`,
      `world=${scene.world.width}x${scene.world.height}m`,
      `seed=${scene.seed}`,
      `entrances=${scene.entrances.length}`,
      `walls=${scene.walls.length}`,
      `maxAgents=${simulationRuntimeProfile.maxAgents}`,
    ].join(" | "),
    exportReplay: [
      `trajectoryWindow=${heatmapSamples.length} samples/${Math.round(sampleWindowSeconds)}s`,
      `latestAgents=${replayAgentCount}`,
      "packedReplay=v1 ready",
      "validationExport=PDF-ready",
    ].join(" | "),
    metricExplanation: [
      `agents=${simulationSnapshot.agentCount} live engine count`,
      `exits=${dashboardStats.exitedCount} cumulative sink arrivals`,
      `densityPeak=${dashboardStats.densityPeak} rolling 4m heatmap cells`,
      `evacuation=${evacuation.active ? "active flow plan" : "standby"}`,
    ].join(" | "),
    riskNotes: createRiskNotes({
      atAgentLimit,
      hasLiveSamples,
      scene,
    }),
    runtime: formatSimulationRuntimeArtifact(runtimeArtifact),
    status,
  };
}

function createRiskNotes({
  atAgentLimit,
  hasLiveSamples,
  scene,
}: {
  atAgentLimit: boolean;
  hasLiveSamples: boolean;
  scene: CrowdSimScene;
}) {
  const notes = [
    "Use as engineering regression and operational estimate, not certified evacuation approval.",
  ];

  if (!hasLiveSamples) {
    notes.push("Start the simulation to populate density, flow, and replay evidence.");
  }

  if (atAgentLimit) {
    notes.push(
      "Agent cap reached; arrivals are throttled by the browser runtime limit.",
    );
  }

  if (scene.basemaps.length === 0) {
    notes.push(
      "No calibrated basemap attached; geometry confidence depends on scene data.",
    );
  }

  return notes;
}
