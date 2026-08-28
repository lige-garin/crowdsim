import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { useI18n } from "./i18n";
import { describeViewportRenderMode } from "./viewportRenderMode";
import { selectCrowdAgents } from "./agentInstanceField";
import {
  selectAgentIntentOverlay,
  type ViewportAgentOverlayFrame,
} from "./simulationViewportOverlay";
import type { SimulationSnapshot } from "./simulationEngine";
import { defaultViewportLayers, type ViewportLayers } from "./viewportLayers";
import type { HeatmapCell } from "./heatmap";
import { useSimulationViewportRenderer } from "./useSimulationViewportRenderer";
import {
  ViewportCityLabelOverlay,
  ViewportLiveAgentOverlay,
  ViewportUnsupportedNotice,
} from "./SimulationViewportOverlays";
import type { ViewMode } from "./simulationViewportTypes";

export type { ViewMode } from "./simulationViewportTypes";

export function SimulationViewport({
  heatmapCells = [],
  layers = defaultViewportLayers,
  scene: crowdScene,
  sharedAgentOverlay,
  snapshot,
  viewMode = "2d",
}: {
  heatmapCells?: readonly HeatmapCell[];
  layers?: ViewportLayers;
  scene?: CrowdSimScene;
  sharedAgentOverlay?: ViewportAgentOverlayFrame;
  snapshot?: SimulationSnapshot;
  viewMode?: ViewMode;
}) {
  const { t, language } = useI18n();
  const { canvasRef, fps, renderMode, selectedAgentId, status } =
    useSimulationViewportRenderer({
      crowdScene,
      heatmapCells,
      layers,
      sharedAgentOverlay,
      snapshot,
      viewMode,
    });
  const pickedAgent =
    selectedAgentId == null
      ? undefined
      : selectCrowdAgents(snapshot?.agents, sharedAgentOverlay?.agents).find(
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
  return (
    <div
      className={`render-viewport ${
        viewMode === "3d" ? "render-viewport-3d" : "render-viewport-2d"
      }`}
    >
      <canvas ref={canvasRef} data-testid="viewport-canvas" />
      {renderMode === "unsupported" && (
        <ViewportUnsupportedNotice
          language={language}
          detail={status.type === "raw" ? status.message : undefined}
        />
      )}
      <ViewportLiveAgentOverlay
        scene={crowdScene}
        sharedAgentOverlay={sharedAgentOverlay}
        snapshot={snapshot}
        viewMode={viewMode}
      />
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
        <span>{viewMode === "3d" ? t("view3d") : t("view2d")}</span>
        <span>{t("renderBenchmark")}</span>
        <span>{fps > 0 ? `${fps} fps` : "..."}</span>
      </div>
      {viewMode === "3d" && pickedAgent && (
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
