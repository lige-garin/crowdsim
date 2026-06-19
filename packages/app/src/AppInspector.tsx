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
import { formatSceneName, useI18n } from "./i18n";
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
  const { language, t } = useI18n();
  const activeSignals = signals.slice(0, 4);
  const areaCount = scene.areas.length + scene.roads.length + scene.buildings.length;

  return (
    <aside
      className="inspector biocity-inspector-compact"
      aria-label={t("systemSignals")}
    >
      <header className="biocity-inspector-title">
        <span>{language === "zh" ? "分析看板" : "Analytics panel"}</span>
        <strong>{formatSceneName(scene, language)}</strong>
      </header>

      <section className="biocity-score-strip" aria-label="BioCity key metrics">
        <Metric
          label={language === "zh" ? "客流" : "Footfall"}
          value={dashboardStats.currentAgentCount.toLocaleString()}
        />
        <Metric
          label={language === "zh" ? "离场" : "Exited"}
          value={dashboardStats.exitedCount.toLocaleString()}
        />
        <Metric
          label={language === "zh" ? "密度峰值" : "Density peak"}
          value={String(dashboardStats.densityPeak)}
        />
        <Metric
          label={language === "zh" ? "选店概率" : "Store-choice"}
          value={`${dashboardV2Stats.shopEntryRatePercent}%`}
        />
      </section>

      <BioCityAnalyticsPanel
        elapsedSeconds={elapsedSeconds}
        heatmapCells={heatmapCells}
        scene={scene}
      />

      <section className="biocity-compact-panel" aria-label="BioCity scene objects">
        <header>
          <span>{language === "zh" ? "场景对象" : "Scene objects"}</span>
          <strong>{areaCount}</strong>
        </header>
        <div className="biocity-object-grid">
          <Metric
            label={language === "zh" ? "道路" : "Roads"}
            value={String(scene.roads.length)}
          />
          <Metric
            label={language === "zh" ? "建筑" : "Buildings"}
            value={String(scene.buildings.length)}
          />
          <Metric
            label={language === "zh" ? "公交站" : "Transit"}
            value={String(scene.transitStops.length)}
          />
          <Metric
            label={language === "zh" ? "风险" : "Risks"}
            value={String(scene.hazards.length)}
          />
        </div>
      </section>

      <section className="biocity-compact-panel" aria-label="BioCity system status">
        <header>
          <span>{language === "zh" ? "系统状态" : "System status"}</span>
          <strong>{formatStatus(simulationCredibility.status, language)}</strong>
        </header>
        <div className="biocity-status-list">
          <Row
            label={language === "zh" ? "内核" : "Kernel"}
            value={formatStatus(webGpuProbe.status, language)}
          />
          <Row
            label={language === "zh" ? "队列" : "Queue"}
            value={
              queueSystemProbe.status === "ready"
                ? `${queueSystemProbe.throughput}/30s`
                : formatStatus(queueSystemProbe.status, language)
            }
          />
          <Row
            label={language === "zh" ? "品牌" : "Brand"}
            value={
              shopDecisionProbe.status === "ready"
                ? (shopDecisionProbe.brandInsight?.selectedBrandName ??
                  formatStatus("ready", language))
                : formatStatus(shopDecisionProbe.status, language)
            }
          />
          <Row
            label={language === "zh" ? "回放" : "Replay"}
            value={
              language === "zh"
                ? `${trajectoryRecording.frames.length} 帧`
                : `${trajectoryRecording.frames.length} frames`
            }
          />
          <Row
            label={language === "zh" ? "疏散" : "Evacuation"}
            value={
              evacuation.active
                ? language === "zh"
                  ? "已触发"
                  : "active"
                : language === "zh"
                  ? "待命"
                  : "standby"
            }
          />
        </div>
      </section>

      <section
        className="biocity-compact-panel biocity-signal-dock"
        aria-label="BioCity signal dock"
      >
        <header>
          <span>{language === "zh" ? "工程状态" : "Engineering signals"}</span>
          <strong>{language === "zh" ? "已收起" : "Collapsed"}</strong>
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

function formatStatus(status: string, language: "en" | "zh") {
  if (language === "en") {
    return status;
  }

  const labels: Record<string, string> = {
    checking: "检查中",
    error: "异常",
    fallback: "兼容模式",
    limited: "受限",
    operational: "运行正常",
    ready: "就绪",
    standby: "待命",
    unsupported: "不支持",
    "warming-up": "预热中",
  };

  return labels[status] ?? status;
}
