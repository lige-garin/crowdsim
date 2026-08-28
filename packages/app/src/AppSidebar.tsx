import type { Language, TranslationKey } from "./i18n";
import { heatmapWindows } from "./appUi";
import type { ReactNode } from "react";
import type { SimulationStatus } from "./simulationEngine";
import type { EditorTool } from "./sceneEditorState";
import { workspacePaletteGroups } from "./workspacePalette";
import {
  viewportLayerText,
  type ViewportLayerId,
  type ViewportLayers,
} from "./viewportLayers";

type AppSidebarProps = {
  agentCount: number;
  editorTool: EditorTool;
  exitedCount: number;
  heatmapWindowSeconds: number;
  language: Language;
  layers: ViewportLayers;
  onClearEvacuation: () => void;
  onEditorToolChange: (tool: EditorTool) => void;
  onEvacuate: () => void;
  onHeatmapWindowChange: (seconds: number) => void;
  onPause: () => void;
  onReset: () => void;
  onSetLanguage: (language: Language) => void;
  onSetTimeScale: (speed: number) => void;
  onStart: () => void;
  onToggleLayer: (layer: ViewportLayerId) => void;
  simulationStatus: SimulationStatus;
  spawnedCount: number;
  t: (key: TranslationKey) => string;
  timeScale: number;
};

export function AppSidebar({
  agentCount,
  editorTool,
  exitedCount,
  heatmapWindowSeconds,
  language,
  layers,
  onClearEvacuation,
  onEditorToolChange,
  onEvacuate,
  onHeatmapWindowChange,
  onPause,
  onReset,
  onSetLanguage,
  onSetTimeScale,
  onStart,
  onToggleLayer,
  simulationStatus,
  spawnedCount,
  t,
  timeScale,
}: AppSidebarProps) {
  const controlLabels =
    language === "zh"
      ? {
          heatmap: "热力窗口",
          incident: "疏散",
          run: "运行控制",
          speed: "仿真倍率",
          workspace: "工作台",
        }
      : {
          heatmap: "Heatmap window",
          incident: "Evacuation",
          run: "Run controls",
          speed: "Simulation speed",
          workspace: "Workspace",
        };

  return (
    <aside className="sidebar" aria-label={controlLabels.workspace}>
      <div className="biocity-sidebar-head">
        <p className="eyebrow">{controlLabels.workspace}</p>
        <h1>BioCity Studio</h1>
        <div className="language-toggle" aria-label={t("language")}>
          <button
            type="button"
            aria-pressed={language === "zh"}
            onClick={() => onSetLanguage("zh")}
          >
            中文
          </button>
          <button
            type="button"
            aria-pressed={language === "en"}
            onClick={() => onSetLanguage("en")}
          >
            EN
          </button>
        </div>
      </div>
      {workspacePaletteGroups.map((group) => (
        <section
          className="biocity-tool-group"
          key={group.title.en}
          aria-label={group.title[language]}
        >
          <h2>{group.title[language]}</h2>
          <div className="biocity-tool-grid">
            {group.entries.map((entry) =>
              entry.kind === "editor" ? (
                <button
                  type="button"
                  key={entry.id}
                  data-testid={`palette-${entry.id}`}
                  aria-pressed={editorTool === entry.tool}
                  onClick={() => onEditorToolChange(entry.tool)}
                  title={entry.label[language]}
                >
                  <span aria-hidden="true">{entry.glyph}</span>
                  <strong>{entry.label[language]}</strong>
                </button>
              ) : (
                <button
                  type="button"
                  key={entry.id}
                  data-testid={`palette-${entry.id}`}
                  aria-pressed={layers[entry.layer]}
                  onClick={() => onToggleLayer(entry.layer)}
                  title={viewportLayerText[entry.layer][language]}
                >
                  <span aria-hidden="true">{entry.glyph}</span>
                  <strong>{entry.label[language]}</strong>
                </button>
              ),
            )}
          </div>
        </section>
      ))}
      <section className="sidebar-summary" aria-label={t("systemSignals")}>
        <article>
          <span>{t("agents")}</span>
          <strong>{agentCount.toLocaleString()}</strong>
        </article>
        <article>
          <span>{t("spawned")}</span>
          <strong>{spawnedCount.toLocaleString()}</strong>
        </article>
        <article>
          <span>{t("exited")}</span>
          <strong>{exitedCount.toLocaleString()}</strong>
        </article>
      </section>
      <section className="sim-controls" aria-label={t("simulationControls")}>
        <header className="sim-controls-header">
          <p className="eyebrow">{t("engine")}</p>
          <h2>{simulationStatus === "running" ? t("running") : t("paused")}</h2>
          <span data-state={simulationStatus}>
            {simulationStatus === "running" ? t("running") : t("paused")}
          </span>
        </header>
        <ControlGroup title={controlLabels.run}>
          <div className="control-row">
            {simulationStatus === "running" ? (
              <button
                type="button"
                className="sim-primary"
                data-testid="sim-toggle"
                onClick={onPause}
              >
                {t("pause")}
              </button>
            ) : (
              <button
                type="button"
                className="sim-primary"
                data-testid="sim-toggle"
                onClick={onStart}
              >
                {t("start")}
              </button>
            )}
            <button type="button" onClick={onReset}>
              {t("reset")}
            </button>
          </div>
        </ControlGroup>
        <ControlGroup title={controlLabels.incident}>
          <div className="control-row">
            <button type="button" onClick={onEvacuate}>
              {t("evacuate")}
            </button>
            <button type="button" onClick={onClearEvacuation}>
              {t("clear")}
            </button>
          </div>
        </ControlGroup>
        <ControlGroup title={controlLabels.speed}>
          <div className="speed-group" aria-label={t("simulationSpeed")}>
            {[1, 2, 4, 8].map((speed) => (
              <button
                type="button"
                key={speed}
                aria-pressed={timeScale === speed}
                onClick={() => onSetTimeScale(speed)}
              >
                {speed}x
              </button>
            ))}
          </div>
        </ControlGroup>
        <ControlGroup title={controlLabels.heatmap}>
          <div className="heatmap-window" aria-label={t("heatmapTimeWindow")}>
            <span>{t("heatmap")}</span>
            <div className="window-group">
              {heatmapWindows.map((seconds) => (
                <button
                  type="button"
                  key={seconds}
                  aria-pressed={heatmapWindowSeconds === seconds}
                  onClick={() => onHeatmapWindowChange(seconds)}
                >
                  {seconds}s
                </button>
              ))}
            </div>
          </div>
        </ControlGroup>
      </section>
    </aside>
  );
}

function ControlGroup({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="control-group">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
