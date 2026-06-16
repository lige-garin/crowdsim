import type { Language, TranslationKey } from "./i18n";
import { heatmapWindows, milestones } from "./appUi";
import type { SimulationStatus } from "./simulationEngine";

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
  return (
    <aside className="sidebar" aria-label={t("milestoneQueue")}>
      <div>
        <p className="eyebrow">{t("appName")}</p>
        <h1>{t("controlRoom")}</h1>
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
        <div>
          <p className="eyebrow">{t("engine")}</p>
          <h2>{simulationStatus === "running" ? t("running") : t("paused")}</h2>
        </div>
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
        <div className="control-row">
          <button type="button" onClick={onEvacuate}>
            {t("evacuate")}
          </button>
          <button type="button" onClick={onClearEvacuation}>
            {t("clear")}
          </button>
        </div>
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
      </section>
    </aside>
  );
}
