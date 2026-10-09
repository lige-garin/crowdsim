import { useState, type ComponentProps } from "react";
import { AppBuildRail } from "./AppBuildRail";
import { AppFloatingWindow } from "./AppFloatingWindow";
import { AppHudTop } from "./AppHudTop";
import { AppInfoRail } from "./AppInfoRail";
import { AppInspector } from "./AppInspector";
import { AppStage } from "./AppStage";
import { PanelDock } from "./panels/PanelDock";
import { TrajectoryReplayBar } from "./panels/TrajectoryReplayBar";
import { ValidationReportPanel } from "./panels/ValidationReportPanel";
import { infoWindows, type InfoWindowId } from "./hudCatalog";
import type { Language, TranslationKey } from "./i18n";
import type { StageTab, StageViewMode } from "./AppTypes";
import type { SimulationStatus } from "./engine/simulationEngine";
import { heatmapWindows } from "./appUi";
import type { ViewportLayerId, ViewportLayers } from "./viewport/viewportLayers";
import type { EditorTool } from "./editor/sceneEditorState";
import type { UiMode } from "./uiMode";

import type { HudReadout } from "./appTopbarMetrics";

/** The run controls and palette state the HUD drives. */
type WorkbenchControls = {
  agentCount: number;
  canUndoBuild: boolean;
  editorTool: EditorTool;
  evacuationActive: boolean;
  exitedCount: number;
  heatmapWindowSeconds: number;
  layers: ViewportLayers;
  onClearEvacuation: () => void;
  onEditorToolChange: (tool: EditorTool) => void;
  onEvacuate: () => void;
  onHeatmapWindowChange: (seconds: number) => void;
  onPause: () => void;
  onReset: () => void;
  onReplay?: () => void;
  replaying: boolean;
  onSetLanguage: (language: Language) => void;
  onSetTimeScale: (speed: number) => void;
  onStart: () => void;
  onToggleLayer: (layer: ViewportLayerId) => void;
  onUndoBuild: () => void;
  simulationStatus: SimulationStatus;
  timeScale: number;
};

type AppWorkbenchProps = {
  controls: WorkbenchControls;
  inspectorProps: ComponentProps<typeof AppInspector>;
  language: Language;
  persistenceError?: string | null;
  onHome: () => void;
  onStageTabChange: (tab: StageTab) => void;
  onViewModeChange: (viewMode: StageViewMode) => void;
  panelDockProps: ComponentProps<typeof PanelDock>;
  sceneName: string;
  stageProps: ComponentProps<typeof AppStage>;
  stageTab: StageTab;
  t: (key: TranslationKey) => string;
  readouts: { clock: HudReadout; weather: HudReadout };
  /** Present while the recorded run is being replayed. */
  replay?: ComponentProps<typeof TrajectoryReplayBar>;
  uiMode: UiMode;
  viewMode: StageViewMode;
};

/**
 * The city-builder shell: the scene fills the window, everything else floats.
 *
 * What this replaced was a three-column grid — 238px of controls, the scene,
 * 318px of analytics — plus a top bar and a bottom dock, so roughly a third of
 * the screen was chrome that was on whether or not it was being used, and the
 * same agent count rendered in four of those regions at once. Here the rails
 * are icons, every readout is opened on demand, and the scene is the interface.
 */
export function AppWorkbench({
  controls,
  inspectorProps,
  language,
  persistenceError,
  onHome,
  onStageTabChange,
  onViewModeChange,
  panelDockProps,
  sceneName,
  stageProps,
  stageTab,
  t,
  readouts,
  replay,
  uiMode,
  viewMode,
}: AppWorkbenchProps) {
  const basic = uiMode === "basic";
  // Basic mode's third step, "watch the dashboard," has to already be open
  // when the run view mounts -- a user who does not yet know this app has no
  // reason to discover the info rail's analytics icon.
  const [openWindows, setOpenWindows] = useState<InfoWindowId[]>(() =>
    basic ? ["analytics"] : [],
  );
  const [reportOpen, setReportOpen] = useState(false);

  // The window last touched draws on top; a newly opened window is touched.
  // "report" is basic mode's own floating window, outside the expert-mode
  // `InfoWindowId` catalog (`hudCatalog.ts`), since only two windows can ever
  // compete for focus there -- analytics (auto-opened) and this one.
  const [focusedWindow, setFocusedWindow] = useState<InfoWindowId | "report" | null>(
    null,
  );

  function toggleWindow(id: InfoWindowId) {
    const opening = !openWindows.includes(id);
    setOpenWindows((current) =>
      current.includes(id) ? current.filter((open) => open !== id) : [...current, id],
    );
    if (opening) setFocusedWindow(id);
  }

  const windowTitle = (id: InfoWindowId) =>
    infoWindows.find((entry) => entry.id === id)?.label[language] ?? id;

  return (
    <main className="workspace game-shell">
      <AppStage {...stageProps} />

      {persistenceError ? (
        <p className="storage-error workspace-storage-error" role="alert">
          {persistenceError}
        </p>
      ) : null}

      <AppHudTop
        {...controls}
        {...readouts}
        language={language}
        onHome={onHome}
        onStageTabChange={onStageTabChange}
        onViewModeChange={onViewModeChange}
        sceneName={sceneName}
        stageTab={stageTab}
        t={t}
        viewMode={viewMode}
      />

      {replay ? <TrajectoryReplayBar {...replay} /> : null}

      {/*
        Basic mode's whole interface is the four-step path (template → run →
        dashboard → report) -- the build toolbar and the info rail's layer
        toggles/tools window are expert-mode surfaces, so neither renders
        here. The dashboard is opened automatically above; this button is
        basic mode's one way to reach step four.
      */}
      {basic ? (
        <button
          type="button"
          className="hud-report-trigger"
          data-testid="hud-report-trigger"
          onClick={() => {
            setReportOpen(true);
            setFocusedWindow("report");
          }}
        >
          {t("exportReport")}
        </button>
      ) : (
        <>
          <AppBuildRail
            canUndo={controls.canUndoBuild}
            editorTool={controls.editorTool}
            language={language}
            onEditorToolChange={controls.onEditorToolChange}
            onUndo={controls.onUndoBuild}
          />

          <AppInfoRail
            language={language}
            layers={controls.layers}
            onToggleLayer={controls.onToggleLayer}
            onToggleWindow={toggleWindow}
            openWindows={openWindows}
          />
        </>
      )}

      {/*
        The heatmap window length only means anything while the heatmap is being
        shown, so it appears with it instead of sitting in a permanently docked
        control group. Values, not labels.
      */}
      {controls.layers.heatmap ? (
        <div
          className="hud-layer-options"
          aria-label={t("heatmapTimeWindow")}
          data-testid="heatmap-window-options"
        >
          {heatmapWindows.map((seconds) => (
            <button
              type="button"
              key={seconds}
              aria-pressed={controls.heatmapWindowSeconds === seconds}
              onClick={() => controls.onHeatmapWindowChange(seconds)}
            >
              {seconds}s
            </button>
          ))}
        </div>
      ) : null}

      {/*
        Opening positions keep clear of the fixed HUD: analytics stops short of
        the right-hand info rail and the heatmap window options beside it; tools
        opens top-left, above the build toolbar and the readouts, not over them.
      */}
      {openWindows.includes("analytics") ? (
        <AppFloatingWindow
          focused={focusedWindow === "analytics"}
          initialX={typeof window === "undefined" ? 420 : window.innerWidth - 560}
          initialY={92}
          onFocus={() => setFocusedWindow("analytics")}
          onClose={() => toggleWindow("analytics")}
          testId="hud-window-analytics"
          title={windowTitle("analytics")}
          width={400}
        >
          <AppInspector {...inspectorProps} />
        </AppFloatingWindow>
      ) : null}

      {!basic && openWindows.includes("tools") ? (
        <AppFloatingWindow
          focused={focusedWindow === "tools"}
          initialX={24}
          initialY={92}
          onFocus={() => setFocusedWindow("tools")}
          onClose={() => toggleWindow("tools")}
          testId="hud-window-tools"
          title={windowTitle("tools")}
          width={720}
        >
          <PanelDock {...panelDockProps} />
        </AppFloatingWindow>
      ) : null}

      {basic && reportOpen ? (
        <AppFloatingWindow
          focused={focusedWindow === "report"}
          initialX={24}
          initialY={92}
          onFocus={() => setFocusedWindow("report")}
          onClose={() => setReportOpen(false)}
          testId="hud-window-report"
          title={t("exportReport")}
          width={420}
        >
          <ValidationReportPanel scene={panelDockProps.context.scene} />
        </AppFloatingWindow>
      ) : null}
    </main>
  );
}
