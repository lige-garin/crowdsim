import { HudIcon, type HudIconName } from "./hudIcons";
import type { Language, TranslationKey } from "./i18n";
import type { SimulationStatus } from "./simulationEngine";
import type { StageTab, StageViewMode } from "./AppTypes";

import type { HudReadout } from "./appTopbarMetrics";

type AppHudTopProps = {
  agentCount: number;
  evacuationActive: boolean;
  exitedCount: number;
  language: Language;
  onClearEvacuation: () => void;
  onHome: () => void;
  onPause: () => void;
  onReset: () => void;
  /** Opens replay of the recorded run; absent while nothing is recorded. */
  onReplay?: () => void;
  replaying: boolean;
  onSetLanguage: (language: Language) => void;
  onSetTimeScale: (speed: number) => void;
  onStageTabChange: (tab: StageTab) => void;
  onStart: () => void;
  onEvacuate: () => void;
  onViewModeChange: (viewMode: StageViewMode) => void;
  sceneName: string;
  simulationStatus: SimulationStatus;
  stageTab: StageTab;
  t: (key: TranslationKey) => string;
  timeScale: number;
  clock: HudReadout;
  weather: HudReadout;
  viewMode: StageViewMode;
};

const VIEW_ICONS: Record<StageViewMode, HudIconName> = {
  "2d": "layers",
  "3d": "scene",
  network: "network",
};

/**
 * The game HUD's corner panels.
 *
 * City builders park their chrome in the corners and leave the middle to the
 * city: a name plate top-left, view controls top-right, the city's numbers
 * bottom-left, the clock and speed bottom-right. The previous shell was one
 * full-width translucent strip across the top — it read as an application
 * toolbar, not a game.
 *
 * No written labels. Controls are icons with `aria-label` + `title`; the only
 * text is live values (a count, a clock, a temperature), which are data.
 */
export function AppHudTop({
  agentCount,
  evacuationActive,
  exitedCount,
  language,
  onClearEvacuation,
  onHome,
  onPause,
  onReset,
  onReplay,
  replaying,
  onSetLanguage,
  onSetTimeScale,
  onStageTabChange,
  onStart,
  onEvacuate,
  onViewModeChange,
  sceneName,
  simulationStatus,
  stageTab,
  t,
  timeScale,
  weather,
  clock,
  viewMode,
}: AppHudTopProps) {
  const running = simulationStatus === "running";
  const zh = language === "zh";

  return (
    <div className="hud-corners" aria-label={zh ? "状态栏" : "Status bar"}>
      <header className="hud-panel hud-plate">
        <button
          type="button"
          className="hud-round"
          onClick={onHome}
          aria-label={zh ? "首页" : "Home"}
          title={zh ? "首页" : "Home"}
        >
          <HudIcon name="home" />
        </button>
        <strong className="hud-plate-name">{sceneName}</strong>
      </header>

      <nav className="hud-panel hud-views" aria-label={t("viewMode")}>
        {(["3d", "2d", "network"] as const).map((mode) => {
          const name =
            mode === "network" ? (zh ? "接触网络" : "Network") : mode.toUpperCase();
          return (
            <button
              type="button"
              key={mode}
              className="hud-key"
              data-testid={`view-mode-${mode}`}
              aria-label={mode === "network" ? name : mode}
              title={name}
              aria-pressed={stageTab === "run" && viewMode === mode}
              onClick={() => onViewModeChange(mode)}
            >
              <HudIcon name={VIEW_ICONS[mode]} />
            </button>
          );
        })}
        <span className="hud-sep" aria-hidden="true" />
        <button
          type="button"
          className="hud-key"
          data-testid="stage-tab-edit"
          aria-label={zh ? "编辑场景" : "Edit scene"}
          title={zh ? "编辑场景" : "Edit scene"}
          aria-pressed={stageTab === "edit"}
          onClick={() => onStageTabChange("edit")}
        >
          <HudIcon name="cursor" />
        </button>
        <span className="hud-sep" aria-hidden="true" />
        <div className="hud-lang" aria-label={t("language")}>
          <button
            type="button"
            className="hud-key hud-key-text"
            aria-label="中文"
            title="中文"
            aria-pressed={language === "zh"}
            onClick={() => onSetLanguage("zh")}
          >
            中
          </button>
          <button
            type="button"
            className="hud-key hud-key-text"
            aria-label="English"
            title="English"
            aria-pressed={language === "en"}
            onClick={() => onSetLanguage("en")}
          >
            EN
          </button>
        </div>
      </nav>

      <section
        className="hud-panel hud-stats"
        aria-label={zh ? "实时读数" : "Live readout"}
      >
        <span className="hud-stat" title={zh ? "在场" : "Present"}>
          <span className="hud-badge hud-badge-blue">
            <HudIcon name="crowd" size={18} />
          </span>
          <b data-testid="hud-agent-count">{agentCount.toLocaleString()}</b>
        </span>
        <span className="hud-stat" title={zh ? "已离开" : "Exited"}>
          <span className="hud-badge hud-badge-slate">
            <HudIcon name="exit" size={18} />
          </span>
          <b>{exitedCount.toLocaleString()}</b>
        </span>
        {weather ? (
          <span className="hud-stat" title={weather.label}>
            <span className="hud-badge hud-badge-teal">
              <HudIcon name="weather" size={18} />
            </span>
            <b>{weather.value}</b>
          </span>
        ) : null}
      </section>

      <section
        className="hud-panel hud-clock"
        aria-label={zh ? "运行控制" : "Transport"}
      >
        {clock ? (
          <b className="hud-clock-time" title={clock.label}>
            {clock.value}
          </b>
        ) : null}
        <button
          type="button"
          className="hud-play"
          data-testid="sim-toggle"
          data-state={simulationStatus}
          aria-label={running ? t("pause") : t("start")}
          title={running ? t("pause") : t("start")}
          aria-pressed={running}
          onClick={running ? onPause : onStart}
        >
          <HudIcon name={running ? "pause" : "play"} size={22} />
        </button>
        <div className="hud-speeds" role="group" aria-label={t("simulationSpeed")}>
          {[1, 2, 4, 8].map((speed) => (
            <button
              type="button"
              key={speed}
              className="hud-speed"
              aria-label={`${speed}×`}
              title={`${speed}×`}
              aria-pressed={timeScale === speed}
              onClick={() => onSetTimeScale(speed)}
            >
              {/* Chevrons, like a game's fast-forward, rather than a number. */}
              {"›".repeat(Math.log2(speed) + 1)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="hud-key"
          data-testid="sim-reset"
          aria-label={t("reset")}
          title={t("reset")}
          onClick={onReset}
        >
          <HudIcon name="reset" />
        </button>
        <button
          type="button"
          className="hud-key"
          data-testid="replay-toggle"
          aria-label={zh ? "回放" : "Replay"}
          title={zh ? "回放" : "Replay"}
          aria-pressed={replaying}
          disabled={!onReplay}
          onClick={onReplay}
        >
          <HudIcon name="replay" />
        </button>
        <button
          type="button"
          className="hud-key hud-key-danger"
          data-testid="evacuate-toggle"
          aria-label={evacuationActive ? t("clear") : t("evacuate")}
          title={evacuationActive ? t("clear") : t("evacuate")}
          aria-pressed={evacuationActive}
          onClick={evacuationActive ? onClearEvacuation : onEvacuate}
        >
          <HudIcon name="hazard" />
        </button>
      </section>
    </div>
  );
}
