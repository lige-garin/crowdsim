import { lazy, Suspense, type ReactNode } from "react";
import { curvePointsToSvg } from "./appUi";
import { AiWorkflowPanel } from "./AiWorkflowPanel";
import { BrandIntelligencePanel } from "./BrandIntelligencePanel";
import { CollaborationStatusPanel } from "./CollaborationStatusPanel";
import type { DashboardStats } from "./dashboardStats";
import type { DashboardV2Stats } from "./dashboardV2Stats";
import { ExperimentSummaryPanel } from "./ExperimentSummaryPanel";
import { ExperimentSweepPanel } from "./ExperimentSweepPanel";
import { formatProbeMessage, useI18n } from "./i18n";
import { ImageGeometryPanel } from "./ImageGeometryPanel";
import { NeuralCorrectionPanel } from "./NeuralCorrectionPanel";
import type {
  AgentStateProbeState,
  DiscreteEventProbeState,
  EvacuationState,
  QueueSystemProbeState,
  ShopDecisionProbeState,
  SystemSignal,
} from "./AppTypes";
import type { FlowFieldProbeResult } from "./flowFieldProbe";
import type { GpuGridProbeResult } from "./gpuGridProbe";
import type { HeatmapProbeResult } from "./heatmapProbe";
import { ScaleReadinessPanel } from "./ScaleReadinessPanel";
import { ScenarioComparisonPanel } from "./ScenarioComparisonPanel";
import { SimulationCredibilityPanel } from "./SimulationCredibilityPanel";
import type { SimulationCredibilityReport } from "./simulationCredibility";
import type { SocialForceProbeResult } from "./socialForceProbe";
import { TilesBackdropPanel } from "./TilesBackdropPanel";
import { TemplateLibraryPanel } from "./TemplateLibraryPanel";
import { ProjectWorkspacePanel } from "./ProjectWorkspacePanel";
import { TrajectoryReplayPanel } from "./TrajectoryReplayPanel";
import type { TrajectoryRecording } from "./trajectoryRecording";
import { ValidationReportPanel } from "./ValidationReportPanel";
import type { WebGpuProbeResult } from "./webgpuProbe";

const DashboardPanel = lazy(() =>
  import("./DashboardPanel").then((module) => ({
    default: module.DashboardPanel,
  })),
);
const DashboardV2Panel = lazy(() =>
  import("./DashboardV2Panel").then((module) => ({
    default: module.DashboardV2Panel,
  })),
);

type AppInspectorProps = {
  agentStateProbe: AgentStateProbeState;
  dashboardStats: DashboardStats;
  dashboardV2Stats: DashboardV2Stats;
  discreteEventProbe: DiscreteEventProbeState;
  evacuation: EvacuationState;
  flowFieldProbe: FlowFieldProbeResult;
  gridProbe: GpuGridProbeResult;
  heatmapProbe: HeatmapProbeResult;
  queueSystemProbe: QueueSystemProbeState;
  shopDecisionProbe: ShopDecisionProbeState;
  signals: readonly SystemSignal[];
  simulationCredibility: SimulationCredibilityReport;
  socialForceProbe: SocialForceProbeResult;
  trajectoryRecording: TrajectoryRecording;
  webGpuProbe: WebGpuProbeResult;
};

export function AppInspector({
  agentStateProbe,
  dashboardStats,
  dashboardV2Stats,
  discreteEventProbe,
  evacuation,
  flowFieldProbe,
  gridProbe,
  heatmapProbe,
  queueSystemProbe,
  shopDecisionProbe,
  signals,
  simulationCredibility,
  socialForceProbe,
  trajectoryRecording,
  webGpuProbe,
}: AppInspectorProps) {
  const { language, t, text } = useI18n();

  return (
    <aside className="inspector" aria-label={t("systemSignals")}>
      <Suspense fallback={<section className="dashboard-panel" />}>
        <DashboardPanel stats={dashboardStats} />
      </Suspense>
      <Suspense fallback={<section className="dashboard-v2-panel" />}>
        <DashboardV2Panel stats={dashboardV2Stats} />
      </Suspense>
      <BrandIntelligencePanel
        insight={
          shopDecisionProbe.status === "ready"
            ? shopDecisionProbe.brandInsight
            : undefined
        }
      />
      <SimulationCredibilityPanel report={simulationCredibility} />
      <TrajectoryReplayPanel recording={trajectoryRecording} />
      <CollaborationStatusPanel />
      <ProjectWorkspacePanel />
      <TemplateLibraryPanel />
      <AiWorkflowPanel />
      <ValidationReportPanel />
      <ExperimentSummaryPanel />
      <ScenarioComparisonPanel />
      <ExperimentSweepPanel />
      <ScaleReadinessPanel />
      <ImageGeometryPanel />
      <TilesBackdropPanel />
      <NeuralCorrectionPanel />
      <h2>{t("systemSignals")}</h2>
      <dl>
        {signals.map((signal) => (
          <div key={signal.label}>
            <dt>{signal.label}</dt>
            <dd>{signal.value}</dd>
          </div>
        ))}
      </dl>
      <ProbePanel title={t("computeProbe")} ariaLabel={t("computeProbe")}>
        <p>{formatProbeMessage(webGpuProbe.message, language)}</p>
        <code>
          {webGpuProbe.output.length > 0
            ? webGpuProbe.output.join(", ")
            : t("noReadback")}
        </code>
      </ProbePanel>
      <ProbePanel title={t("desQueue")} ariaLabel={t("desQueue")}>
        <p>{formatProbeMessage(discreteEventProbe.message, language)}</p>
        <code>
          {discreteEventProbe.labels.length > 0
            ? `${discreteEventProbe.labels.join(" | ")} @ ${discreteEventProbe.now.toFixed(2)}s`
            : t("noEvents")}
        </code>
      </ProbePanel>
      <ProbePanel title={t("agentState")} ariaLabel={t("agentState")}>
        <p>{formatProbeMessage(agentStateProbe.message, language)}</p>
        <code>
          {agentStateProbe.labels.length > 0
            ? `${agentStateProbe.labels.join(" -> ")} | SAB ${agentStateProbe.sabStateLabels.join(", ")}`
            : t("noStates")}
        </code>
      </ProbePanel>
      <ProbePanel title={t("shopDecision")} ariaLabel={t("shopDecision")}>
        <p>{formatProbeMessage(shopDecisionProbe.message, language)}</p>
        <code>
          {shopDecisionProbe.status === "ready"
            ? `${shopDecisionProbe.profileLabels.join(", ")} | goal ${shopDecisionProbe.goalChoice} | commuter ${shopDecisionProbe.commuterChoice} | ${shopDecisionProbe.browserSummary}`
            : t("noDecision")}
        </code>
      </ProbePanel>
      <ProbePanel title={t("queueSystem")} ariaLabel={t("queueSystem")}>
        <p>{formatProbeMessage(queueSystemProbe.message, language)}</p>
        <code>
          {queueSystemProbe.status === "ready"
            ? `layout ${queueSystemProbe.layout} | fifo ${queueSystemProbe.dequeued.join(", ")} | service ${queueSystemProbe.serviceTimes.join(", ")}s | throughput ${queueSystemProbe.throughput}/30s`
            : t("noQueue")}
        </code>
      </ProbePanel>
      <ProbePanel title={t("hashGrid")} ariaLabel={t("hashGrid")}>
        <p>{formatProbeMessage(gridProbe.message, language)}</p>
        <code>
          {gridProbe.sortedAgentIds.length > 0
            ? `ids ${gridProbe.cellIds.join(", ")} | sorted ${gridProbe.sortedAgentIds.join(", ")}`
            : t("noReadback")}
        </code>
      </ProbePanel>
      <ProbePanel title={t("socialForce")} ariaLabel={t("socialForce")}>
        <p>{formatProbeMessage(socialForceProbe.message, language)}</p>
        <code>
          {socialForceProbe.positions.length > 0
            ? socialForceProbe.positions.map((value) => value.toFixed(3)).join(", ")
            : t("noReadback")}
        </code>
      </ProbePanel>
      <ProbePanel title={t("flowField")} ariaLabel={t("flowField")}>
        <p>{formatProbeMessage(flowFieldProbe.message, language)}</p>
        <code>
          {flowFieldProbe.directions.length > 0
            ? flowFieldProbe.directions.join(", ")
            : t("noReadback")}
        </code>
      </ProbePanel>
      <ProbePanel title={t("heatmap")} ariaLabel={t("densityHeatmap")}>
        <p>{formatProbeMessage(heatmapProbe.message, language)}</p>
        <code>
          {heatmapProbe.cellCounts.length > 0
            ? `counts ${heatmapProbe.cellCounts.join(", ")} | max ${heatmapProbe.maxCount}`
            : t("noReadback")}
        </code>
      </ProbePanel>
      <section className="evacuation-panel" aria-label={t("evacuationCurve")}>
        <h3>{t("evacuation")}</h3>
        <p>
          {evacuation.flowPlan
            ? `${text(evacuation.flowPlan.message)} 路 ${evacuation.flowPlan.reachableCells} ${t("cells")}`
            : t("noEvacuationActive")}
        </p>
        <svg viewBox="0 0 120 48" role="img" aria-label={t("evacuationRemainingCurve")}>
          <polyline points={curvePointsToSvg(evacuation.curve)} />
        </svg>
        <code>
          {evacuation.curve.length > 0
            ? evacuation.curve
                .map(
                  (point) => `${Math.round(point.elapsedSeconds)}s:${point.remaining}`,
                )
                .join(" | ")
            : t("noCurve")}
        </code>
      </section>
    </aside>
  );
}

function ProbePanel({
  ariaLabel,
  children,
  title,
}: {
  ariaLabel: string;
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="probe-panel" aria-label={ariaLabel}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}
