import type { CrowdSimScene } from "@crowdsim/scene-schema";
import type { Language } from "./i18n";
import { CityHeroScene } from "./renderer/CityHeroScene";
import { TemplateGallery } from "./TemplateGallery";
import type { UiMode } from "./uiMode";

type AppHomeProps = {
  language: Language;
  onEnterLab: () => void;
  onOpenNetwork: () => void;
  onSelectTemplate: (scene: CrowdSimScene) => void;
  onSetLanguage: (language: Language) => void;
  onToggleUiMode: () => void;
  runState: string;
  uiMode: UiMode;
  webGpuStatus: string;
};

type HomeCopy = {
  basicModeAction: string;
  basicSubtitle: string;
  expertModeAction: string;
  kicker: string;
  lab: string;
  languageLabel: string;
  networkAction: string;
  pageLabel: string;
  primaryAction: string;
  statusLabel: string;
  stepOneLabel: string;
  subtitle: string;
  title: string;
};

const homeCopy: Record<Language, HomeCopy> = {
  zh: {
    basicModeAction: "切到普通模式",
    basicSubtitle: "四步做完一次仿真:选模板 → 跑起来 → 看驾驶舱 → 出报告。",
    expertModeAction: "切到专家模式",
    kicker: "商业客流运营套件",
    lab: "商业客流操作系统",
    languageLabel: "语言",
    networkAction: "查看接触网络",
    pageLabel: "CrowdSim 首页",
    primaryAction: "进入运营台",
    statusLabel: "运行摘要",
    stepOneLabel: "第 1 步 · 选模板",
    subtitle: "把客流仿真、品牌吸引、接触网络和验证报告放进一个可交付的商业运营台。",
    title: "CrowdSim Operations",
  },
  en: {
    basicModeAction: "Switch to basic mode",
    basicSubtitle:
      "Four steps to a finished run: pick a template → run it → watch the dashboard → export a report.",
    expertModeAction: "Switch to expert mode",
    kicker: "Commercial operations suite",
    lab: "Commercial crowd operating system",
    languageLabel: "Language",
    networkAction: "View network",
    pageLabel: "CrowdSim home",
    primaryAction: "Open console",
    statusLabel: "Run summary",
    stepOneLabel: "Step 1 · Pick a template",
    subtitle:
      "Simulation, brand pull, contact networks, and validation reports in one client-ready operating console.",
    title: "CrowdSim Operations",
  },
};

export function AppHome({
  language,
  onEnterLab,
  onOpenNetwork,
  onSelectTemplate,
  onSetLanguage,
  onToggleUiMode,
  runState,
  uiMode,
  webGpuStatus,
}: AppHomeProps) {
  const copy = homeCopy[language];
  const basic = uiMode === "basic";
  const pulses = [
    { label: "SIM", value: runState },
    { label: "GPU", value: webGpuStatus },
    // Was "AI". Image tracing has no model: it only runs hand-written demo
    // fixtures, so the home screen no longer advertises a capability that
    // does not exist. See docs/CLAIMS_LEDGER.md.
    { label: "TRACE", value: "fixture" },
    // Was "D1/R2", then "memory" once the backend's own honesty note
    // explained its default store was in-memory, not real Cloudflare D1/R2.
    // Both readings described a backend that no longer exists:
    // packages/backend was deleted 2026-09-24 (see docs/CLAIMS_LEDGER.md)
    // because it was never deployable and never reachable from this
    // client. The only real persistence left is what SceneEditor.tsx
    // already does -- localStorage and file export/import.
    { label: "DATA", value: "local" },
  ];

  return (
    <main id="main-content" className="home-shell" aria-label={copy.pageLabel}>
      <div className="home-city-backdrop" aria-hidden="true">
        <CityHeroScene />
        <div className="home-city-veil" />
      </div>
      <header className="home-topbar">
        <div className="home-brand">
          <span>CrowdSim</span>
          <strong>{copy.lab}</strong>
        </div>
        <div className="home-language" aria-label={copy.languageLabel}>
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
        <button
          type="button"
          className="home-mode-toggle"
          aria-pressed={!basic}
          onClick={onToggleUiMode}
        >
          {basic ? copy.expertModeAction : copy.basicModeAction}
        </button>
      </header>

      {basic ? (
        <section className="home-hero home-hero-basic">
          <div className="home-copy">
            <p className="home-kicker">{copy.kicker}</p>
            <h1>{copy.title}</h1>
            <p>{copy.basicSubtitle}</p>
          </div>
          <div className="home-template-step">
            <p className="home-step-label">{copy.stepOneLabel}</p>
            <TemplateGallery language={language} onSelect={onSelectTemplate} />
          </div>
        </section>
      ) : (
        <section className="home-hero">
          <div className="home-copy">
            <p className="home-kicker">{copy.kicker}</p>
            <h1>{copy.title}</h1>
            <p>{copy.subtitle}</p>
            <div className="home-actions">
              <button type="button" className="home-primary" onClick={onEnterLab}>
                {copy.primaryAction}
              </button>
              <button type="button" className="home-secondary" onClick={onOpenNetwork}>
                {copy.networkAction}
              </button>
            </div>
            <div className="home-rail" aria-label={copy.statusLabel}>
              {pulses.map((pulse) => (
                <article key={pulse.label}>
                  <span>{pulse.label}</span>
                  <strong>{pulse.value}</strong>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
