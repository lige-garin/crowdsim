import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ContactNetworkView } from "./panels/ContactNetworkView";
import { buildCrowdContactNetwork } from "./engine/crowdContactNetwork";
import { formatSimulationClock } from "./appUi";
import type { HeatmapCell } from "./analytics/heatmap";
import type { Language, TranslationKey } from "./i18n";
import { SceneEditor } from "./editor/SceneEditor";
import type { StageTab, StageViewMode } from "./AppTypes";
import type { SimulationAgent } from "./engine/simulationEngine";
import { useLiveCrowd, type LiveCrowd } from "./engine/liveCrowd";
import { FloorSwitcher, type SwitchableFloor } from "./editor/FloorSwitcher";
import type { ViewedFloor } from "./viewport/agentInstanceField";
import type { EditorTool } from "./editor/sceneEditorState";
import type { ViewportLayers } from "./viewport/viewportLayers";

const SimulationViewport = lazy(() =>
  import("./viewport/SimulationViewport").then((module) => ({
    default: module.SimulationViewport,
  })),
);

const noHeatmapCells: readonly HeatmapCell[] = [];

/**
 * How often the contact-network view re-derives its graph. The build is O(N²)
 * over the whole crowd — two thousand people is two million pairs — and it
 * used to run inside the JSX on every snapshot, i.e. sixty times a second,
 * which was by far the most expensive thing this view did. Twice a second is
 * as fast as a graph of twelve nodes can be read anyway.
 */
const contactNetworkSampleMs = 500;

type AppStageProps = {
  /** The floors of the scene, lowest first; empty when it has none. */
  floors: readonly SwitchableFloor[];
  /** The floor being watched, and where it sits in `floors` (ADR-0010). */
  viewFloor?: ViewedFloor;
  onSelectViewFloor: (floorId: string) => void;
  /**
   * The scene as it is on the floor being watched. The editor gets the whole
   * scene instead: it draws one floor at a time but must keep them all.
   */
  viewScene: CrowdSimScene;
  editorTool: EditorTool;
  heatmapCells: readonly HeatmapCell[];
  language: Language;
  layers: ViewportLayers;
  onApplyScene: (scene: CrowdSimScene) => void;
  onEditorToolChange: (tool: EditorTool) => void;
  onPlaceInWorld: (tool: EditorTool, point: ScenePoint) => void;
  /** A count line dragged out between two points (ADR-0031). */
  onPlaceLineInWorld: (start: ScenePoint, end: ScenePoint) => void;
  /** The live crowd, read by subscription rather than passed down (liveCrowd). */
  crowd: LiveCrowd;
  scene: CrowdSimScene;
  /**
   * The user-level fault surface (REVIEW-2026-10-02 P1 #7): a dead simulation
   * worker used to surface as one English engineering-log line in the signal
   * dock. This card says what stopped, what survived, and how to restart.
   * Null while the worker path is unused or healthy.
   */
  simulationFault: { message: string; onRetry: () => void } | null;
  stageTab: StageTab;
  t: (key: TranslationKey) => string;
  viewMode: StageViewMode;
};

export function AppStage({
  crowd,
  editorTool,
  floors,
  viewFloor,
  onSelectViewFloor,
  viewScene,
  heatmapCells,
  language,
  layers,
  onApplyScene,
  onEditorToolChange,
  onPlaceInWorld,
  onPlaceLineInWorld,
  scene,
  simulationFault,
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
  // Sampled from the store on a timer rather than derived from `snapshot` on
  // every render: a snapshot lands sixty times a second, and the graph below
  // costs O(N²) to build (see `contactNetworkSampleMs`).
  const [networkAgents, setNetworkAgents] = useState<readonly SimulationAgent[]>(
    () => crowd.get().snapshot?.agents ?? [],
  );
  useEffect(() => {
    if (viewMode !== "network") return;
    const sample = () => setNetworkAgents(crowd.get().snapshot?.agents ?? []);
    sample();
    const intervalId = window.setInterval(sample, contactNetworkSampleMs);
    return () => window.clearInterval(intervalId);
  }, [crowd, viewMode]);
  const contactNetwork = useMemo(
    () =>
      buildCrowdContactNetwork(networkAgents, {
        worldHeight: scene.world.height,
        worldWidth: scene.world.width,
      }),
    [networkAgents, scene.world.height, scene.world.width],
  );
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
          <ContactNetworkView network={contactNetwork} />
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
                floor={viewFloor}
                heatmapCells={heatmapCells}
                layers={layers}
                onPlace={onPlaceInWorld}
                onPlaceLine={onPlaceLineInWorld}
                placementTool={viewMode === "3d" ? editorTool : undefined}
                scene={viewScene}
                crowd={crowd}
                viewMode={viewMode}
              />
              {floors.length > 0 ? (
                <div
                  className="editor-floorbar stage-floorbar"
                  aria-label={t("floors")}
                  data-testid="stage-floors"
                >
                  <span className="editor-floorbar-label">{t("floors")}</span>
                  <FloorSwitcher
                    activeFloorId={viewFloor?.id}
                    floors={floors}
                    onSelect={onSelectViewFloor}
                  />
                </div>
              ) : null}
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
              className="timeline"
              aria-label={language === "zh" ? "仿真时钟" : "Simulation clock"}
            >
              <div className="time-rail">
                <span>{language === "zh" ? "已运行" : "Elapsed"}</span>
                <div
                  className="time-progress"
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
      {simulationFault ? (
        /*
          Reuses the viewport-unsupported card's look on purpose: one blocking
          overlay language for "the stage cannot do its job right now". The
          raw message stays reachable under the details toggle for bug
          reports (task #18's diagnostics channel will feed off it too).
        */
        <div
          className="render-unsupported simulation-fault"
          data-testid="simulation-fault"
          role="alert"
        >
          <div className="render-unsupported-card">
            <p className="render-unsupported-eyebrow">{t("simulationFaultEyebrow")}</p>
            <h3>{t("simulationFaultTitle")}</h3>
            <p>{t("simulationFaultBody")}</p>
            <button
              type="button"
              className="simulation-fault-retry"
              data-testid="simulation-fault-retry"
              onClick={simulationFault.onRetry}
            >
              {t("retrySimulation")}
            </button>
            <details>
              <summary>{t("technicalDetail")}</summary>
              <code>{simulationFault.message}</code>
            </details>
          </div>
        </div>
      ) : null}
    </section>
  );
}
