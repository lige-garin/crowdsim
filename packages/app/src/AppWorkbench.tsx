import type { ComponentProps } from "react";
import { AppInspector } from "./AppInspector";
import { AppSidebar } from "./AppSidebar";
import { AppStage } from "./AppStage";
import { PanelDock } from "./PanelDock";
import type { Language, TranslationKey } from "./i18n";
import type { createLiveSimulationRuntimeArtifact } from "./simulationRuntimeArtifact";

type RuntimeArtifact = ReturnType<typeof createLiveSimulationRuntimeArtifact>;
type TopbarMetric = {
  label: string;
  state?: string;
  value: number | string;
};

type AppWorkbenchProps = {
  inspectorProps: ComponentProps<typeof AppInspector>;
  language: Language;
  onHome: () => void;
  panelDockProps: ComponentProps<typeof PanelDock>;
  runState: string;
  runtime: RuntimeArtifact;
  sceneName: string;
  sidebarProps: ComponentProps<typeof AppSidebar>;
  simulationStatus: string;
  stageProps: ComponentProps<typeof AppStage>;
  t: (key: TranslationKey) => string;
  topbarMetrics: readonly TopbarMetric[];
  webGpuStatus: string;
};

export function AppWorkbench({
  inspectorProps,
  language,
  onHome,
  panelDockProps,
  runState,
  runtime,
  sceneName,
  sidebarProps,
  simulationStatus,
  stageProps,
  t,
  topbarMetrics,
  webGpuStatus,
}: AppWorkbenchProps) {
  return (
    <main className="workspace">
      <header className="command-bar biocity-topbar">
        <div className="command-brand">
          <span>CrowdSim</span>
          <strong>
            {language === "zh" ? "商业客流运营台" : "Commercial crowd console"}
          </strong>
          <span className="biocity-project-name">{sceneName}</span>
          <button type="button" className="command-home" onClick={onHome}>
            {language === "zh" ? "首页" : "Home"}
          </button>
        </div>
        <div
          className="command-status biocity-ops-status"
          aria-label="BioCity operating status"
        >
          {topbarMetrics.map((metric) => (
            <article key={metric.label}>
              <span>{metric.label}</span>
              <strong data-state={metric.state}>{metric.value}</strong>
            </article>
          ))}
        </div>
        <div className="command-status" aria-label={t("systemSignals")}>
          <article>
            <span>{language === "zh" ? "运行" : "Runtime"}</span>
            <strong data-state={simulationStatus}>{runState}</strong>
          </article>
          <article>
            <span>WebGPU</span>
            <strong>{webGpuStatus}</strong>
          </article>
          <article>
            <span>{language === "zh" ? "决策" : "Decision"}</span>
            <strong>{runtime.decisionBackend}</strong>
          </article>
        </div>
      </header>
      <AppSidebar {...sidebarProps} />
      <AppStage {...stageProps} />
      <AppInspector {...inspectorProps} />
      <PanelDock {...panelDockProps} />
    </main>
  );
}
