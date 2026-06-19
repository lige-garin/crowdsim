import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { BioCityAnalyticsPanel } from "./BioCityAnalyticsPanel";
import type {
  AgentStateProbeState,
  DiscreteEventProbeState,
  EvacuationState,
  QueueSystemProbeState,
  ShopDecisionProbeState,
  SystemSignal,
} from "./AppTypes";
import type { DashboardStats } from "./dashboardStats";
import type { DashboardV2Stats } from "./dashboardV2Stats";
import type { FlowFieldProbeResult } from "./flowFieldProbe";
import type { GpuGridProbeResult } from "./gpuGridProbe";
import type { HeatmapCell } from "./heatmap";
import type { HeatmapProbeResult } from "./heatmapProbe";
import { useI18n } from "./i18n";
import type { SimulationCredibilityReport } from "./simulationCredibility";
import type { SocialForceProbeResult } from "./socialForceProbe";
import type { TrajectoryRecording } from "./trajectoryRecording";
import type { WebGpuProbeResult } from "./webgpuProbe";

type AppInspectorProps = {
  agentStateProbe: AgentStateProbeState;
  dashboardStats: DashboardStats;
  dashboardV2Stats: DashboardV2Stats;
  discreteEventProbe: DiscreteEventProbeState;
  elapsedSeconds: number;
  evacuation: EvacuationState;
  flowFieldProbe: FlowFieldProbeResult;
  gridProbe: GpuGridProbeResult;
  heatmapCells: readonly HeatmapCell[];
  heatmapProbe: HeatmapProbeResult;
  queueSystemProbe: QueueSystemProbeState;
  scene: CrowdSimScene;
  shopDecisionProbe: ShopDecisionProbeState;
  signals: readonly SystemSignal[];
  simulationCredibility: SimulationCredibilityReport;
  socialForceProbe: SocialForceProbeResult;
  trajectoryRecording: TrajectoryRecording;
  webGpuProbe: WebGpuProbeResult;
};

export function AppInspector({
  dashboardStats,
  dashboardV2Stats,
  elapsedSeconds,
  evacuation,
  heatmapCells,
  queueSystemProbe,
  scene,
  shopDecisionProbe,
  signals,
  simulationCredibility,
  trajectoryRecording,
  webGpuProbe,
}: AppInspectorProps) {
  const { t } = useI18n();
  const activeSignals = signals.slice(0, 4);
  const areaCount = scene.areas.length + scene.roads.length + scene.buildings.length;

  return (
    <aside
      className="inspector biocity-inspector-compact"
      aria-label={t("systemSignals")}
    >
      <header className="biocity-inspector-title">
        <span>分析看板</span>
        <strong>{scene.name}</strong>
      </header>

      <section className="biocity-score-strip" aria-label="BioCity key metrics">
        <Metric
          label="客流"
          value={dashboardStats.currentAgentCount.toLocaleString()}
        />
        <Metric label="离场" value={dashboardStats.exitedCount.toLocaleString()} />
        <Metric label="密度峰值" value={String(dashboardStats.densityPeak)} />
        <Metric label="进店率" value={`${dashboardV2Stats.shopEntryRatePercent}%`} />
      </section>

      <BioCityAnalyticsPanel
        elapsedSeconds={elapsedSeconds}
        heatmapCells={heatmapCells}
        scene={scene}
      />

      <section className="biocity-compact-panel" aria-label="BioCity scene objects">
        <header>
          <span>场景对象</span>
          <strong>{areaCount}</strong>
        </header>
        <div className="biocity-object-grid">
          <Metric label="道路" value={String(scene.roads.length)} />
          <Metric label="建筑" value={String(scene.buildings.length)} />
          <Metric label="公交站" value={String(scene.transitStops.length)} />
          <Metric label="风险" value={String(scene.hazards.length)} />
        </div>
      </section>

      <section className="biocity-compact-panel" aria-label="BioCity system status">
        <header>
          <span>系统状态</span>
          <strong>{simulationCredibility.status}</strong>
        </header>
        <div className="biocity-status-list">
          <Row label="内核" value={webGpuProbe.status} />
          <Row
            label="队列"
            value={
              queueSystemProbe.status === "ready"
                ? `${queueSystemProbe.throughput}/30s`
                : queueSystemProbe.status
            }
          />
          <Row
            label="品牌"
            value={
              shopDecisionProbe.status === "ready"
                ? (shopDecisionProbe.brandInsight?.selectedBrandName ?? "ready")
                : shopDecisionProbe.status
            }
          />
          <Row label="回放" value={`${trajectoryRecording.frames.length} frames`} />
          <Row label="疏散" value={evacuation.active ? "active" : "standby"} />
        </div>
      </section>

      <section
        className="biocity-compact-panel biocity-signal-dock"
        aria-label="BioCity signal dock"
      >
        <header>
          <span>工程状态</span>
          <strong>收起</strong>
        </header>
        <div className="biocity-status-list">
          {activeSignals.map((signal) => (
            <Row key={signal.label} label={signal.label} value={signal.value} />
          ))}
        </div>
      </section>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
