import type { Language, TranslationKey } from "./i18n";
import { heatmapWindows, milestones } from "./appUi";
import { useState, type ReactNode } from "react";
import type { SimulationStatus } from "./simulationEngine";
import { bioCityPlanningToolGroupText } from "./bioCityUiContract";

type AppSidebarProps = {
  agentCount: number;
  exitedCount: number;
  heatmapWindowSeconds: number;
  language: Language;
  onClearEvacuation: () => void;
  onEvacuate: () => void;
  onHeatmapWindowChange: (seconds: number) => void;
  onPause: () => void;
  onReset: () => void;
  onSetLanguage: (language: Language) => void;
  onSetTimeScale: (speed: number) => void;
  onStart: () => void;
  simulationStatus: SimulationStatus;
  spawnedCount: number;
  t: (key: TranslationKey) => string;
  timeScale: number;
};

export function AppSidebar({
  agentCount,
  exitedCount,
  heatmapWindowSeconds,
  language,
  onClearEvacuation,
  onEvacuate,
  onHeatmapWindowChange,
  onPause,
  onReset,
  onSetLanguage,
  onSetTimeScale,
  onStart,
  simulationStatus,
  spawnedCount,
  t,
  timeScale,
}: AppSidebarProps) {
  const [activePlanningTool, setActivePlanningTool] = useState("Roads");
  const controlLabels =
    language === "zh"
      ? {
          heatmap: "热力窗口",
          incident: "疏散",
          run: "运行控制",
          speed: "仿真倍率",
        }
      : {
          heatmap: "Heatmap window",
          incident: "Evacuation",
          run: "Run controls",
          speed: "Simulation speed",
        };

  return (
    <aside className="sidebar" aria-label={t("milestoneQueue")}>
      <div className="biocity-sidebar-head">
        <p className="eyebrow">
          {language === "zh" ? "城市规划工具" : "City planning tools"}
        </p>
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
      <section className="biocity-toolbox" aria-label="BioCity planning toolbox">
        {bioCityPlanningToolGroupText.map((group) => (
          <div className="biocity-tool-group" key={group.title.en}>
            <h2>{group.title[language]}</h2>
            <div className="biocity-tool-grid">
              {group.tools.map((tool) => (
                <button
                  type="button"
                  key={tool.label.en}
                  aria-pressed={activePlanningTool === tool.label.en}
                  onClick={() => setActivePlanningTool(tool.label.en)}
                  title={tool.label[language]}
                >
                  <span>{tool.icon}</span>
                  <strong>{tool.label[language]}</strong>
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>
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
      <ol className="task-list">
        {milestones.map((milestone) => (
          <li key={milestone.id}>
            <span className="task-id">{milestone.id}</span>
            <span>{t(milestone.labelKey)}</span>
            <strong>{t(milestone.statusKey)}</strong>
          </li>
        ))}
      </ol>
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
              <button type="button" className="sim-primary" onClick={onPause}>
                {t("pause")}
              </button>
            ) : (
              <button type="button" className="sim-primary" onClick={onStart}>
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
