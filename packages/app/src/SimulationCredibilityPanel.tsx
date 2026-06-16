import { useI18n } from "./i18n";
import type { SimulationCredibilityReport } from "./simulationCredibility";

type SimulationCredibilityPanelProps = {
  report: SimulationCredibilityReport;
};

export function SimulationCredibilityPanel({
  report,
}: SimulationCredibilityPanelProps) {
  const { language } = useI18n();
  const title = language === "zh" ? "可信度闭环" : "Credibility loop";
  const statusLabel =
    language === "zh" ? statusLabels.zh[report.status] : statusLabels.en[report.status];

  return (
    <section className="probe-panel" aria-label={title}>
      <h3>{title}</h3>
      <p>{statusLabel}</p>
      <code>{report.constraints}</code>
      <code>{report.runtime}</code>
      <code>{report.metricExplanation}</code>
      <code>{report.exportReplay}</code>
      <ul>
        {report.riskNotes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  );
}

const statusLabels = {
  en: {
    limited: "Limited: runtime caps or missing evidence affect interpretation.",
    operational: "Operational: live samples and runtime checks are available.",
    "warming-up": "Warming up: run the simulation to collect evidence.",
  },
  zh: {
    limited: "受限：运行上限或证据不足会影响解读。",
    operational: "可用：已有实时样本和运行时检查。",
    "warming-up": "预热中：启动仿真后收集证据。",
  },
} as const;
