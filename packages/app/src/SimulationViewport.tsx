import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";
import { useI18n } from "./i18n";
import { describeViewportRenderMode } from "./viewportRenderMode";
import { selectCrowdAgents, type ViewedFloor } from "./agentInstanceField";
import { selectAgentIntentOverlay } from "./simulationViewportOverlay";
import { noLiveCrowd, useLiveCrowd, type LiveCrowd } from "./liveCrowd";
import { defaultViewportLayers, type ViewportLayers } from "./viewportLayers";
import type { HeatmapCell } from "./heatmap";
import { useSimulationViewportRenderer } from "./renderer/useSimulationViewportRenderer";
import {
  HeatmapLegendOverlay,
  ViewportCityLabelOverlay,
  ViewportLiveAgentOverlay,
  ViewportUnsupportedNotice,
} from "./SimulationViewportOverlays";
import type { ViewMode } from "./simulationViewportTypes";
import type { EditorTool } from "./sceneEditorState";

export type { ViewMode } from "./simulationViewportTypes";

export function SimulationViewport({
  crowd = noLiveCrowd,
  floor,
  heatmapCells = [],
  layers = defaultViewportLayers,
  onPlace,
  onPlaceLine,
  placementTool,
  scene: crowdScene,
  viewMode = "2d",
}: {
  /** The live crowd (liveCrowd); the view subscribes to it. */
  crowd?: LiveCrowd;
  /** The floor being watched, when the scene has floors (ADR-0010). */
  floor?: ViewedFloor;
  heatmapCells?: readonly HeatmapCell[];
  layers?: ViewportLayers;
  onPlace?: (tool: EditorTool, point: ScenePoint) => void;
  /** A count line dragged out between two points (ADR-0031). */
  onPlaceLine?: (start: ScenePoint, end: ScenePoint) => void;
  placementTool?: EditorTool;
  scene?: CrowdSimScene;
  viewMode?: ViewMode;
}) {
  const { t, language } = useI18n();
  const { sharedAgentOverlay, snapshot } = useLiveCrowd(crowd);
  const { canvasRef, fps, renderMode, selectedAgentId, status } =
    useSimulationViewportRenderer({
      crowdScene,
      floor,
      heatmapCells,
      layers,
      onPlace,
      onPlaceLine,
      placementTool,
      sharedAgentOverlay,
      snapshot,
      viewMode,
    });
  const pickedAgent =
    selectedAgentId == null
      ? undefined
      : selectCrowdAgents(snapshot?.agents, sharedAgentOverlay?.agents, floor).find(
          (agent) => agent.id === selectedAgentId,
        );
  const pickedFull =
    selectedAgentId == null
      ? undefined
      : snapshot?.agents.find((agent) => agent.id === selectedAgentId);
  const pickedIntent =
    pickedAgent && crowdScene
      ? selectAgentIntentOverlay(pickedFull ?? { id: pickedAgent.id }, {
          seed: crowdScene.seed,
        })
      : undefined;
  const blocked = renderMode === "unsupported" || renderMode === "failed";
  return (
    <div
      className={`render-viewport ${
        viewMode === "3d" ? "render-viewport-3d" : "render-viewport-2d"
      }`}
    >
      <canvas ref={canvasRef} data-testid="viewport-canvas" />
      {blocked && (
        <ViewportUnsupportedNotice
          kind={renderMode === "failed" ? "failed" : "unsupported"}
          language={language}
          detail={status.type === "raw" ? status.message : undefined}
        />
      )}
      {/*
        The DOM label layers are placed at fixed percentages, not projected
        through the camera, so once the 3d camera can pan and rotate they point
        at the wrong buildings. And the city view carries no permanent text:
        people are coloured by what they are doing, and details open on click.
      */}
      {!blocked && viewMode !== "3d" && (
        <>
          <ViewportLiveAgentOverlay crowd={crowd} scene={crowdScene} />
          <ViewportCityLabelOverlay scene={crowdScene} viewMode={viewMode} />
          <div className="render-hud" aria-label={t("renderStatus")}>
            <span>{status.type === "localized" ? t(status.key) : status.message}</span>
            {(() => {
              const mode = describeViewportRenderMode(renderMode, language);
              return mode ? (
                <span className="render-mode-badge" title={mode.caveat}>
                  {mode.label}
                </span>
              ) : null;
            })()}
            <strong>
              {(snapshot?.agentCount ?? 0).toLocaleString()} {t("visualAgents")}
            </strong>
            <span>{t("view2d")}</span>
            <span>{t("renderBenchmark")}</span>
            <span>{fps > 0 ? `${fps} fps` : "..."}</span>
          </div>
        </>
      )}
      {/* ADR-0006: a compatibility renderer must say so on screen. Full GPU
          rendering needs no badge, so the 3d view stays clean. */}
      {!blocked && viewMode === "3d" && renderMode === "compat" && (
        <div className="render-compat-badge" aria-label={t("renderStatus")}>
          {describeViewportRenderMode(renderMode, language)?.label}
        </div>
      )}
      {!blocked && layers.heatmap && <HeatmapLegendOverlay language={language} />}
      {!blocked && viewMode === "3d" && pickedAgent && (
        <div className="render-selected-agent" aria-live="polite">
          <strong>Agent #{pickedAgent.id}</strong>
          {pickedIntent && (
            <span>
              {pickedIntent.icon} {pickedIntent.label}
            </span>
          )}
          <span>
            x {pickedAgent.x.toFixed(1)} / y {pickedAgent.y.toFixed(1)}
          </span>
        </div>
      )}
    </div>
  );
}
