import type { CrowdSimScene } from "@crowdsim/scene-schema";
import type { Language } from "./i18n";
import { CityHeroScene } from "./renderer/CityHeroScene";
import { TemplateGallery } from "./panels/TemplateGallery";
import { ProjectList } from "./projects/ProjectList";
import { MapPlacement } from "./projects/MapPlacement";
import { ProjectDetailsForm } from "./projects/ProjectDetailsForm";
import type { Project } from "./projects/projectStore";
import type { ProjectDetails } from "./projects/ProjectDetailsForm";
import type { UiMode } from "./uiMode";

type AppHomeProps = {
  /** Step 2 of the new-project flow: pick the site on a map. */
  creatingProject: boolean;
  language: Language;
  onCancelProjectCreate: () => void;
  onCreateProject: () => void;
  onEnterLab: () => void;
  onOpenNetwork: () => void;
  onOpenProject: (project: Project) => void;
  /** What step 2 produced, or null while the wizard is not on step 3. */
  pendingLocation: { lat: number; lng: number; radiusMeters: number } | null;
  /** Why the last create was refused, or null if it was not. */
  projectSaveError: string | null;
  onProjectPlace: (point: { lat: number; lng: number }, radiusMeters: number) => void;
  onProjectSubmit: (details: ProjectDetails) => void;
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
  templateStepLabel: string;
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
    templateStepLabel: "或者，先拿一个模板看看",
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
    templateStepLabel: "Or start from a template",
    subtitle:
      "Simulation, brand pull, contact networks, and validation reports in one client-ready operating console.",
    title: "CrowdSim Operations",
  },
};

export function AppHome({
  creatingProject,
  language,
  onCancelProjectCreate,
  onCreateProject,
  onEnterLab,
  onOpenNetwork,
  onOpenProject,
  onProjectPlace,
  onProjectSubmit,
  projectSaveError,
  pendingLocation,
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
          {creatingProject ? (
            // Step 2 replaces the list rather than opening over it: the list's
            // buttons are all "open something else", and leaving them under a
            // half-finished wizard is how a coordinate ends up on the wrong
            // project.
            pendingLocation ? (
              <ProjectDetailsForm
                onCancel={onCancelProjectCreate}
                onSubmit={onProjectSubmit}
                place={pendingLocation}
                saveError={projectSaveError}
              />
            ) : (
              <MapPlacement onCancel={onCancelProjectCreate} onNext={onProjectPlace} />
            )
          ) : (
            <>
              {/*
               * Projects first, templates second. Someone who has already made
               * a project came back to work on it, and a wall of demo scenes
               * above their own work is noise. Templates matter to whoever has
               * nothing yet, and they keep their place below for that reason.
               */}
              <div className="home-project-step">
                <p className="home-step-label">
                  {language === "zh" ? "项目" : "Projects"}
                </p>
                <ProjectList onCreate={onCreateProject} onOpen={onOpenProject} />
              </div>
              <div className="home-template-step">
                <p className="home-step-label">{copy.templateStepLabel}</p>
                <TemplateGallery language={language} onSelect={onSelectTemplate} />
              </div>
            </>
          )}
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
