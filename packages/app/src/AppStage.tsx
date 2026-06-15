import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { lazy, Suspense } from "react";
import { ContactNetworkView } from "./ContactNetworkView";
import { formatStageViewButton, formatStageViewMode } from "./appUi";
import type { HeatmapCell } from "./heatmap";
import type { Language, TranslationKey } from "./i18n";
import { SceneEditor } from "./SceneEditor";
import type { StageViewMode } from "./AppTypes";
import type { SimulationSnapshot } from "./simulationEngine";

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
  simulationSnapshot: SimulationSnapshot;
  t: (key: TranslationKey) => string;
  viewMode: StageViewMode;
};

export function AppStage({
  heatmapCells,
  language,
  onViewModeChange,
  scene,
  simulationSnapshot,
  t,
  viewMode,
}: AppStageProps) {
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
        {viewMode === "network" ? (
          <ContactNetworkView />
        ) : (
          <>
            <Suspense fallback={<div className="render-viewport" />}>
              <SimulationViewport
                scene={scene}
                snapshot={simulationSnapshot}
                viewMode={viewMode}
              />
            </Suspense>
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
