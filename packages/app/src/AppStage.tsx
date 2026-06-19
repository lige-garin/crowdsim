import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { lazy, Suspense } from "react";
import { ContactNetworkView } from "./ContactNetworkView";
import {
  formatSimulationClock,
  formatStageViewButton,
  formatStageViewMode,
} from "./appUi";
import type { HeatmapCell } from "./heatmap";
import type { Language, TranslationKey } from "./i18n";
import { SceneEditor } from "./SceneEditor";
import type { StageViewMode } from "./AppTypes";
import type { SimulationRuntimeArtifact } from "./simulationRuntimeArtifact";
import type { SimulationSnapshot } from "./simulationEngine";
import type { ViewportAgentOverlayFrame } from "./simulationViewportOverlay";
import { bioCityLayerNames } from "./bioCityUiContract";

const SimulationViewport = lazy(() =>
  import("./SimulationViewport").then((module) => ({
    default: module.SimulationViewport,
  })),
);

type AppStageProps = {
  heatmapCells: readonly HeatmapCell[];
  language: Language;
  onViewModeChange: (viewMode: StageViewMode) => void;
  scene: CrowdSimScene;
  sharedAgentOverlay?: ViewportAgentOverlayFrame;
  simulationSnapshot: SimulationSnapshot;
  runtime: SimulationRuntimeArtifact;
  t: (key: TranslationKey) => string;
  viewMode: StageViewMode;
};

export function AppStage({
  heatmapCells,
  language,
  onViewModeChange,
  scene,
  sharedAgentOverlay,
  simulationSnapshot,
  runtime,
  t,
  viewMode,
}: AppStageProps) {
  const telemetry = [
    {
      label: language === "zh" ? "人数" : "Agents",
      value: simulationSnapshot.agentCount.toLocaleString(),
    },
    {
      label: language === "zh" ? "离场" : "Exited",
      value: simulationSnapshot.exitedCount.toLocaleString(),
    },
    {
      label: language === "zh" ? "时钟" : "Clock",
      value: formatSimulationClock(simulationSnapshot.elapsedSeconds),
    },
    {
      label: language === "zh" ? "内核" : "Kernel",
      value: `${runtime.thread}/${runtime.sharedMemory}`,
    },
  ];

  return (
    <section className="stage" aria-label={t("simulationViewport")}>
      <div className="stage-stack">
        <div className="stage-toolbar" aria-label={t("viewMode")}>
          <span>{formatStageViewMode(viewMode, language, t)}</span>
          <div className="view-mode-toggle">
            {(["2d", "3d", "network"] as const).map((mode) => (
              <button
                type="button"
                key={mode}
                aria-pressed={viewMode === mode}
                onClick={() => onViewModeChange(mode)}
              >
                {formatStageViewButton(mode, language)}
              </button>
            ))}
          </div>
        </div>
        <div className="stage-telemetry" aria-label="Live telemetry">
          {telemetry.map((item) => (
            <article key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>
        {viewMode === "network" ? (
          <ContactNetworkView />
        ) : (
          <>
            <Suspense
              fallback={
                <div className="render-viewport render-viewport-skeleton">
                  <span />
                  <span />
                  <span />
                </div>
              }
            >
              <SimulationViewport
                heatmapCells={heatmapCells}
                scene={scene}
                sharedAgentOverlay={sharedAgentOverlay}
                snapshot={simulationSnapshot}
                viewMode={viewMode}
              />
            </Suspense>
            <div className="biocity-timeline" aria-label="BioCity simulation timeline">
              <div className="biocity-layer-toggles" aria-label="BioCity layers">
                {bioCityLayerNames.map((layer) => (
                  <label key={layer}>
                    <input type="checkbox" checked readOnly />
                    <span>{layer}</span>
                  </label>
                ))}
              </div>
              <div className="biocity-time-rail">
                <span>05/20 06:00</span>
                <input
                  aria-label="Simulation timeline"
                  max={3600}
                  min={0}
                  readOnly
                  type="range"
                  value={Math.min(3600, simulationSnapshot.elapsedSeconds)}
                />
                <span>{formatSimulationClock(simulationSnapshot.elapsedSeconds)}</span>
              </div>
            </div>
            <SceneEditor
              heatmapCells={heatmapCells}
              scene={scene}
              simulationSnapshot={simulationSnapshot}
            />
          </>
        )}
      </div>
    </section>
  );
}
