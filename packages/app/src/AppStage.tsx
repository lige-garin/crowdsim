import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";
import { lazy, Suspense, useState } from "react";
import { ContactNetworkView } from "./ContactNetworkView";
import { buildCrowdContactNetwork } from "./crowdContactNetwork";
import { formatSimulationClock } from "./appUi";
import type { HeatmapCell } from "./heatmap";
import type { Language, TranslationKey } from "./i18n";
import { SceneEditor } from "./SceneEditor";
import type { StageTab, StageViewMode } from "./AppTypes";
import { useLiveCrowd, type LiveCrowd } from "./liveCrowd";
import type { EditorTool } from "./sceneEditorState";
import type { ViewportLayers } from "./viewportLayers";

const SimulationViewport = lazy(() =>
  import("./SimulationViewport").then((module) => ({
    default: module.SimulationViewport,
  })),
);

const noHeatmapCells: readonly HeatmapCell[] = [];

type AppStageProps = {
  editorTool: EditorTool;
  heatmapCells: readonly HeatmapCell[];
  language: Language;
  layers: ViewportLayers;
  onApplyScene: (scene: CrowdSimScene) => void;
  onEditorToolChange: (tool: EditorTool) => void;
  onPlaceInWorld: (tool: EditorTool, point: ScenePoint) => void;
  /** The live crowd, read by subscription rather than passed down (liveCrowd). */
  crowd: LiveCrowd;
  scene: CrowdSimScene;
  stageTab: StageTab;
  t: (key: TranslationKey) => string;
  viewMode: StageViewMode;
};

export function AppStage({
  crowd,
  editorTool,
  heatmapCells,
  language,
  layers,
  onApplyScene,
  onEditorToolChange,
  onPlaceInWorld,
  scene,
  stageTab,
  t,
  viewMode,
}: AppStageProps) {
  const { snapshot } = useLiveCrowd(crowd);
  const elapsedSeconds = snapshot?.elapsedSeconds ?? 0;
  // The rail shows progress through a rolling hour rather than pretending to
  // know a wall-clock start time.
  const elapsedWindowSeconds = 3600;
  const elapsedFraction = Math.min(
    1,
    Math.max(0, elapsedSeconds / elapsedWindowSeconds),
  );

  const editing = stageTab === "edit";
  // Mounted on first use and then kept, hidden, while another view shows: it
  // holds unapplied work (drafted walls, its undo history, parameter edits)
  // that unmounting threw away the moment the user glanced at the city.
  const [editorOpened, setEditorOpened] = useState(editing);
  if (editing && !editorOpened) {
    setEditorOpened(true);
  }

  return (
    <section
      className={`stage stage-${viewMode} stage-tab-${stageTab}`}
      aria-label={t("simulationViewport")}
    >
      <div className="stage-stack">
        {editorOpened ? (
          <SceneEditor
            // While hidden it gets no live crowd, so it does not redraw two
            // thousand agents nobody can see.
            heatmapCells={editing ? heatmapCells : noHeatmapCells}
            hidden={!editing}
            onApplyScene={onApplyScene}
            onToolChange={onEditorToolChange}
            scene={scene}
            crowd={editing ? crowd : undefined}
            tool={editorTool}
          />
        ) : null}
        {editing ? null : viewMode === "network" ? (
          <ContactNetworkView
            network={buildCrowdContactNetwork(snapshot?.agents ?? [], {
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
                onPlace={onPlaceInWorld}
                placementTool={viewMode === "3d" ? editorTool : undefined}
                scene={scene}
                crowd={crowd}
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
                    Math.floor(elapsedSeconds),
                  )}
                >
                  <span style={{ width: `${elapsedFraction * 100}%` }} />
                </div>
                <span>{formatSimulationClock(elapsedSeconds)}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
