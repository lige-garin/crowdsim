import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { BioCityAnalyticsPanel } from "./BioCityAnalyticsPanel";
import { RealObservationsPanel } from "./RealObservationsPanel";
import { RunAnalyticsPanel, type RunAnalyticsExport } from "./RunAnalyticsPanel";
import type { MinuteFlow, RunAnalyticsSummary } from "./runAnalytics";
import type { EvacuationState, SystemSignal } from "./AppTypes";
import type { HeatmapCell } from "./heatmap";
import { formatSceneName, useI18n } from "./i18n";
import type { SimulationCredibilityReport } from "./simulationCredibility";
import type { TrajectoryRecording } from "./trajectoryRecording";
import type { WebGpuProbeResult } from "./webgpuProbe";

type AppInspectorProps = {
  elapsedSeconds: number;
  evacuation: EvacuationState;
  heatmapCells: readonly HeatmapCell[];
  minuteFlows: () => MinuteFlow[];
  onExportRunAnalytics: (kind: RunAnalyticsExport) => void;
  runSummary: RunAnalyticsSummary;
  scene: CrowdSimScene;
  signals: readonly SystemSignal[];
  simulationCredibility: SimulationCredibilityReport;
  trajectoryRecording: TrajectoryRecording;
  webGpuProbe: WebGpuProbeResult;
};

export function AppInspector({
  elapsedSeconds,
  evacuation,
  heatmapCells,
  minuteFlows,
  onExportRunAnalytics,
  runSummary,
  scene,
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
        <span>{language === "zh" ? "实时分析" : "Live analytics"}</span>
        <strong>{formatSceneName(scene, language)}</strong>
      </header>

      {/*
        The key-metrics strip that used to open this rail is gone: footfall,
        exited and density peak now render once, in the stage telemetry beside
        the crowd, and the trajectory frame count is already reported below
        under "system & recording". This rail is analysis, not a fourth copy of
        the same four numbers.
      */}

      <RunAnalyticsPanel
        language={language}
        onExport={onExportRunAnalytics}
        scene={scene}
        summary={runSummary}
      />

      <RealObservationsPanel
        language={language}
        minuteFlows={minuteFlows}
        places={runSummary.places}
      />

      <BioCityAnalyticsPanel
        elapsedSeconds={elapsedSeconds}
        heatmapCells={heatmapCells}
        scene={scene}
      />

      <section
        className="biocity-compact-panel"
        aria-label={language === "zh" ? "场景对象" : "Scene objects"}
      >
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

      <section
        className="biocity-compact-panel"
        aria-label={language === "zh" ? "系统与记录" : "System & recording"}
      >
        <header>
          <span>{language === "zh" ? "系统与记录" : "System & recording"}</span>
          <strong>{formatStatus(simulationCredibility.status, language)}</strong>
        </header>
        <div className="biocity-status-list">
          <Row
            label={language === "zh" ? "内核" : "Kernel"}
            value={formatStatus(webGpuProbe.status, language)}
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
        aria-label={language === "zh" ? "工程状态" : "Engineering signals"}
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
