import type { CrowdSimScene } from "@crowdsim/scene-schema";
import type {
  AgentStateProbeState,
  DecisionRuntimeState,
  DiscreteEventProbeState,
  EvacuationState,
  MovementBackendProbeState,
  QueueSystemProbeState,
  SharedArrayBufferProbeState,
  ShopDecisionProbeState,
  StageViewMode,
  SystemSignal,
} from "./AppTypes";
import {
  formatBehaviorModeLabel,
  formatProbeMessage,
  formatSceneName,
  type Language,
  type TranslationKey,
} from "./i18n";
import { formatSimulationClock, formatStageViewMode } from "./appUi";
import type { FlowFieldProbeResult } from "./flowFieldProbe";
import type { GpuGridProbeResult } from "./gpuGridProbe";
import type { HeatmapProbeResult } from "./heatmapProbe";
import type { MovementBackendId } from "./movementBackend";
import { simulationRuntimeProfile, type SimulationSnapshot } from "./simulationEngine";
import { createSharedArrayBufferSummary } from "./sharedArrayBufferProbe";
import type { SocialForceProbeResult } from "./socialForceProbe";
import type { SimulationWorkerControllerState } from "./useSimulationWorkerController";
import { createDecisionBackendValue } from "./wasmDecisionRuntime";
import type { WebGpuProbeResult } from "./webgpuProbe";

type SystemSignalOptions = {
  agentStateProbe: AgentStateProbeState;
  behaviorSmokeValue: string;
  discreteEventProbe: DiscreteEventProbeState;
  evacuation: EvacuationState;
  flowFieldProbe: FlowFieldProbeResult;
  gridProbe: GpuGridProbeResult;
  heatmapProbe: HeatmapProbeResult;
  heatmapValue: string;
  language: Language;
  movementBackend: MovementBackendId;
  movementBackendProbe: MovementBackendProbeState;
  queueSystemProbe: QueueSystemProbeState;
  scene: CrowdSimScene;
  sharedArrayBufferProbe: SharedArrayBufferProbeState;
  shopDecisionProbe: ShopDecisionProbeState;
  simulationSnapshot: SimulationSnapshot;
  socialForceProbe: SocialForceProbeResult;
  t: (key: TranslationKey) => string;
  viewMode: StageViewMode;
  wasmDecisionRuntime: DecisionRuntimeState;
  webGpuProbe: WebGpuProbeResult;
  workerRuntime: SimulationWorkerControllerState;
};

export function createSystemSignals({
  agentStateProbe,
  behaviorSmokeValue,
  discreteEventProbe,
  evacuation,
  flowFieldProbe,
  gridProbe,
  heatmapProbe,
  heatmapValue,
  language,
  movementBackend,
  movementBackendProbe,
  queueSystemProbe,
  scene,
  sharedArrayBufferProbe,
  shopDecisionProbe,
  simulationSnapshot,
  socialForceProbe,
  t,
  viewMode,
  wasmDecisionRuntime,
  webGpuProbe,
  workerRuntime,
}: SystemSignalOptions): SystemSignal[] {
  return [
    {
      label: t("simulationClock"),
      value: formatSimulationClock(simulationSnapshot.elapsedSeconds),
    },
    { label: t("agents"), value: String(simulationSnapshot.agentCount) },
    { label: t("spawned"), value: String(simulationSnapshot.spawnedCount) },
    { label: t("exited"), value: String(simulationSnapshot.exitedCount) },
    { label: t("speed"), value: `${simulationSnapshot.timeScale}x` },
    {
      label: t("evacuation"),
      value: evacuation.active
        ? formatBehaviorModeLabel(evacuation.label, language)
        : t("standby"),
    },
    { label: t("evacuationExit"), value: evacuation.flowPlan?.exitId ?? t("none") },
    {
      label: t("sceneSchema"),
      value: `${formatSceneName(scene, language)} ${t("valid")}`,
    },
    {
      label: t("movementBackend"),
      value: `${movementBackend} active @ ${simulationRuntimeProfile.movementHz}Hz`,
    },
    {
      label: "WebGPU movement",
      value:
        movementBackendProbe.readyBackend === "webgpu-ready"
          ? `${movementBackendProbe.readyBackend} · probe only`
          : formatProbeMessage(movementBackendProbe.message, language),
    },
    {
      label: t("decisionBackend"),
      value: createDecisionBackendValue(wasmDecisionRuntime),
    },
    {
      label: "Decision ticks",
      value: String(wasmDecisionRuntime.decisionTickCount),
    },
    {
      label: "Shared memory",
      value: createSharedArrayBufferSummary(sharedArrayBufferProbe),
    },
    {
      label: "Simulation thread",
      value: formatSimulationThread(workerRuntime),
    },
    {
      label: t("simulationAgentLimit"),
      value: simulationRuntimeProfile.maxAgents.toLocaleString(),
    },
    { label: t("wasmAdd"), value: formatProbeMessage(behaviorSmokeValue, language) },
    {
      label: t("agentState"),
      value:
        agentStateProbe.status === "ready"
          ? agentStateProbe.restoredLabel
          : formatProbeMessage(agentStateProbe.message, language),
    },
    {
      label: t("shopDecision"),
      value:
        shopDecisionProbe.status === "ready"
          ? `${shopDecisionProbe.goalChoice}/${shopDecisionProbe.commuterChoice}`
          : formatProbeMessage(shopDecisionProbe.message, language),
    },
    {
      label: t("brandAttraction"),
      value:
        shopDecisionProbe.status === "ready" && shopDecisionProbe.brandInsight
          ? `${shopDecisionProbe.brandInsight.persona} -> ${shopDecisionProbe.brandInsight.selectedBrandName} ${shopDecisionProbe.brandInsight.probabilityPercent}%`
          : t("noDecision"),
    },
    {
      label: t("queueSystem"),
      value:
        queueSystemProbe.status === "ready"
          ? `${queueSystemProbe.dequeued.join(",")} / ${queueSystemProbe.throughput}`
          : formatProbeMessage(queueSystemProbe.message, language),
    },
    {
      label: t("desQueue"),
      value:
        discreteEventProbe.status === "ready"
          ? `${discreteEventProbe.labels.length} ${t("events")}`
          : formatProbeMessage(discreteEventProbe.message, language),
    },
    {
      label: "WebGPU",
      value: webGpuProbe.supported
        ? t("ready")
        : formatProbeMessage(webGpuProbe.message, language),
    },
    {
      label: t("hashGrid"),
      value:
        gridProbe.status === "ready"
          ? t("readbackOk")
          : formatProbeMessage(gridProbe.message, language),
    },
    {
      label: t("socialForce"),
      value:
        socialForceProbe.status === "ready"
          ? t("readbackOk")
          : formatProbeMessage(socialForceProbe.message, language),
    },
    {
      label: t("flowField"),
      value:
        flowFieldProbe.status === "ready"
          ? t("readbackOk")
          : formatProbeMessage(flowFieldProbe.message, language),
    },
    {
      label: t("gpuHeatmap"),
      value:
        heatmapProbe.status === "ready"
          ? t("readbackOk")
          : formatProbeMessage(heatmapProbe.message, language),
    },
    { label: t("heatmap"), value: heatmapValue },
    { label: t("viewMode"), value: formatStageViewMode(viewMode, language, t) },
  ];
}

function formatSimulationThread(workerRuntime: SimulationWorkerControllerState) {
  const shared = workerRuntime.sharedMemory ? "SAB" : "postMessage";
  const metrics = workerRuntime.sharedMetrics
    ? `step ${workerRuntime.sharedMetrics.stepCount} | agents ${workerRuntime.sharedMetrics.agentCount}`
    : workerRuntime.message;
  const soa = workerRuntime.sharedAgentSample
    ? ` | soa ${workerRuntime.sharedAgentSample.sharedAgentCount}/${workerRuntime.sharedAgentSample.capacity}`
    : "";

  return `${workerRuntime.mode} | ${shared} | ${metrics}${soa}`;
}
