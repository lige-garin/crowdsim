import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { RetailAnalyticsPanel } from "./panels/RetailAnalyticsPanel";
import type { DashboardSample } from "./analytics/dashboardStats";
import { RealObservationsPanel } from "./panels/RealObservationsPanel";
import { RunAnalyticsPanel, type RunAnalyticsExport } from "./panels/RunAnalyticsPanel";
import type {
  MinuteFlow,
  RunAnalyticsSummary,
  StayKind,
} from "./analytics/runAnalytics";
import type { EvacuationState, SystemSignal } from "./AppTypes";
import type { HeatmapCell } from "./analytics/heatmap";
import { formatSceneName, useI18n } from "./i18n";
import type { SimulationCredibilityReport } from "./engine/simulationCredibility";
import type { TrajectoryRecording } from "./analytics/trajectoryRecording";
import type { WebGpuProbeResult } from "./webgpuProbe";

type AppInspectorProps = {
  dashboardSamples: readonly DashboardSample[];
  elapsedSeconds: number;
  evacuation: EvacuationState;
  /**
   * Whether requesting GPU movement can do anything at all right now --
   * i.e. the worker simulation path is actually in use (`App.tsx`'s
   * `usesWorkerSimulation`). Under `?mainsim` the flag below is read but
   * never consumed (only `useSimulationWorkerController` honours it), so
   * offering the toggle enabled there would let it claim "requested" while
   * having zero effect on which backend runs.
   */
  gpuMovementAvailable: boolean;
  /** ADR-0033 stage 3's own URL flag, read once at mount (see `App.tsx`). */
  gpuMovementRequested: boolean;
  heatmapCells: readonly HeatmapCell[];
  journeyDurations: () => number[];
  minuteFlows: () => MinuteFlow[];
  onExportRunAnalytics: (kind: RunAnalyticsExport) => void;
  placeOccupancyOverTime: (
    kind: StayKind,
    placeId: string,
  ) => { t: number; count: number }[];
  /** Flips the flag above and reloads -- see `urlFlagToggle.ts`. */
  onToggleGpuMovement: () => void;
  runSummary: RunAnalyticsSummary;
  scene: CrowdSimScene;
  signals: readonly SystemSignal[];
  simulationCredibility: SimulationCredibilityReport;
  trajectoryRecording: TrajectoryRecording;
  webGpuProbe: WebGpuProbeResult;
};

export function AppInspector({
  dashboardSamples,
  elapsedSeconds,
  evacuation,
  gpuMovementAvailable,
  gpuMovementRequested,
  heatmapCells,
  journeyDurations,
  minuteFlows,
  onExportRunAnalytics,
  onToggleGpuMovement,
  placeOccupancyOverTime,
  runSummary,
  scene,
  signals,
  simulationCredibility,
  trajectoryRecording,
  webGpuProbe,
}: AppInspectorProps) {
  const { language, t } = useI18n();
  const activeSignals = signals.slice(0, 4);
  // ADR-0033 stage 3: the movement backend row is real runtime state now
  // (cpu-compat by default, webgpu only when a device was actually
  // acquired) -- always shown in the collapsed dock, not just when it
  // happens to land in the first four, since this is exactly the kind of
  // "which backend actually ran" fact the readiness surface exists for.
  const movementBackendSignal = signals.find(
    (signal) => signal.label === t("movementBackend"),
  );
  const dockedSignals =
    movementBackendSignal && !activeSignals.includes(movementBackendSignal)
      ? [...activeSignals, movementBackendSignal]
      : activeSignals;
  const areaCount = scene.areas.length + scene.roads.length + scene.buildings.length;

  return (
    <aside className="inspector inspector-compact" aria-label={t("systemSignals")}>
      <header className="inspector-compact-title">
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
        dashboardSamples={dashboardSamples}
        journeyDurations={journeyDurations}
        language={language}
        minuteFlows={minuteFlows}
        onExport={onExportRunAnalytics}
        placeOccupancyOverTime={placeOccupancyOverTime}
        scene={scene}
        summary={runSummary}
      />

      <RealObservationsPanel
        language={language}
        minuteFlows={minuteFlows}
        places={runSummary.places}
      />

      <RetailAnalyticsPanel
        elapsedSeconds={elapsedSeconds}
        heatmapCells={heatmapCells}
        scene={scene}
      />

      <section
        className="compact-panel"
        aria-label={language === "zh" ? "场景对象" : "Scene objects"}
      >
        <header>
          <span>{language === "zh" ? "场景对象" : "Scene objects"}</span>
          <strong>{areaCount}</strong>
        </header>
        <div className="compact-object-grid">
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
        className="compact-panel"
        aria-label={language === "zh" ? "系统与记录" : "System & recording"}
      >
        <header>
          <span>{language === "zh" ? "系统与记录" : "System & recording"}</span>
          <strong>{formatStatus(simulationCredibility.status, language)}</strong>
        </header>
        <div className="status-list">
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
        className="compact-panel signal-dock"
        aria-label={language === "zh" ? "工程状态" : "Engineering signals"}
      >
        <header>
          <span>{language === "zh" ? "工程状态" : "Engineering signals"}</span>
          <strong>{language === "zh" ? "已收起" : "Collapsed"}</strong>
        </header>
        <div className="status-list">
          {dockedSignals.map((signal) => (
            <Row key={signal.label} label={signal.label} value={signal.value} />
          ))}
        </div>
        {/*
          ADR-0033 stage 3 called for "an explicit, labelled toggle (not a
          default) in the readiness panel" and shipped only a URL flag
          (`?gpumove`) instead -- real, but with no click target anywhere in
          the app. This is that toggle: it flips the same flag and reloads
          (the flag is deliberately read once at mount, never reactively --
          see `App.tsx`'s own comment on it), so clicking it is exactly
          what typing the URL by hand already did, just discoverable. CPU
          stays the default either way (ADR-0006); this only ever requests
          GPU mode, the worker still falls back to cpu-compat on any real
          failure -- which is exactly why this button does NOT gate on
          `webGpuProbe.supported`, despite an earlier version of this
          change doing so. That probe requests a device with no
          `requiredLimits`, while the worker's real GPU-movement device
          request needs `maxStorageBuffersPerShaderStage: 16`
          (`simulation.worker.ts`) -- a device that satisfies the probe can
          still fail the worker's stricter request, which would have left
          this button enabled and labelled "requested" while the backend
          silently stayed cpu-compat: the exact "looks green, isn't"
          failure this project got burned by once already (see CLAUDE.md's
          2026-08-31 entry on `requiredLimits`) and fixed everywhere else
          with fail-loud checks. Gating on a mismatched probe would have
          reintroduced it here. The worst case of never gating on it is a
          click that reloads and gracefully falls back -- already covered,
          and the movement-backend row right above stays the honest source
          of truth for what actually ran either way. The button is only
          disabled when the worker path itself is not in use (see
          `gpuMovementAvailable`'s own comment) -- that is a fact this app
          already decided this session, not a hardware guess that can be
          wrong or still mid-flight.
        */}
        <button
          type="button"
          className="gpu-movement-toggle"
          aria-pressed={gpuMovementRequested}
          disabled={!gpuMovementAvailable}
          title={
            gpuMovementAvailable
              ? undefined
              : language === "zh"
                ? "当前强制主线程仿真（?mainsim）,GPU 移动请求不会生效"
                : "Main-thread simulation is forced (?mainsim) -- a GPU movement request would have no effect"
          }
          onClick={onToggleGpuMovement}
        >
          {language === "zh" ? "GPU 移动(实验性)" : "GPU movement (experimental)"}:{" "}
          {gpuMovementRequested
            ? language === "zh"
              ? "已请求,点击关闭"
              : "requested, click to turn off"
            : language === "zh"
              ? "CPU 默认,点击请求"
              : "CPU default, click to request"}
        </button>
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
