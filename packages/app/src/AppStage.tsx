import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { lazy, Suspense } from "react";
import { ContactNetworkView } from "./ContactNetworkView";
import { buildCrowdContactNetwork } from "./crowdContactNetwork";
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
import type { EditorTool } from "./sceneEditorState";
import type { ViewportLayers } from "./viewportLayers";

const SimulationViewport = lazy(() =>
  import("./SimulationViewport").then((module) => ({
    default: module.SimulationViewport,
  })),
);

type AppStageProps = {
  editorTool: EditorTool;
  heatmapCells: readonly HeatmapCell[];
  language: Language;
  layers: ViewportLayers;
  onApplyScene: (scene: CrowdSimScene) => void;
  onEditorToolChange: (tool: EditorTool) => void;
  onViewModeChange: (viewMode: StageViewMode) => void;
  scene: CrowdSimScene;
  sharedAgentOverlay?: ViewportAgentOverlayFrame;
  simulationSnapshot: SimulationSnapshot;
  runtime: SimulationRuntimeArtifact;
  t: (key: TranslationKey) => string;
  viewMode: StageViewMode;
};

export function AppStage({
  editorTool,
  heatmapCells,
  language,
  layers,
  onApplyScene,
  onEditorToolChange,
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

  // The rail shows progress through a rolling hour rather than pretending to
  // know a wall-clock start time.
  const elapsedWindowSeconds = 3600;
  const elapsedFraction = Math.min(
    1,
    Math.max(0, simulationSnapshot.elapsedSeconds / elapsedWindowSeconds),
  );

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
          <ContactNetworkView
            network={buildCrowdContactNetwork(simulationSnapshot.agents, {
              worldWidth: scene.world.width,
              worldHeight: scene.world.height,
            })}
          />
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
                layers={layers}
                scene={scene}
                sharedAgentOverlay={sharedAgentOverlay}
                snapshot={simulationSnapshot}
                viewMode={viewMode}
              />
            </Suspense>
            {/*
              This strip used to hold five permanently-ticked readOnly
              checkboxes and a readOnly range input labelled "05/20 06:00",
              none of which controlled anything. Layer toggles moved to the
              workspace palette where they really work; what remains is an
              honest, non-interactive elapsed readout. Scrubbing needs
              trajectory replay, which the live loop does not have yet.
            */}
            <div
              className="biocity-timeline"
              aria-label={language === "zh" ? "仿真时钟" : "Simulation clock"}
            >
              <div className="biocity-time-rail">
                <span>{language === "zh" ? "已运行" : "Elapsed"}</span>
                <div
                  className="biocity-time-progress"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={elapsedWindowSeconds}
                  aria-valuenow={Math.min(
                    elapsedWindowSeconds,
                    Math.floor(simulationSnapshot.elapsedSeconds),
                  )}
                >
                  <span style={{ width: `${elapsedFraction * 100}%` }} />
                </div>
                <span>{formatSimulationClock(simulationSnapshot.elapsedSeconds)}</span>
              </div>
            </div>
            <SceneEditor
              heatmapCells={heatmapCells}
              onApplyScene={onApplyScene}
              onToolChange={onEditorToolChange}
              scene={scene}
              simulationSnapshot={simulationSnapshot}
              tool={editorTool}
            />
          </>
        )}
      </div>
    </section>
  );
}
