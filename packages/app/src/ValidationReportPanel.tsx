import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { useMemo, useState } from "react";
import { createAiValidationReportSummary } from "./aiReport";
import { createReportBlob, createValidationReportExportBundle } from "./reportExport";
import { createValidationReport } from "./validationReport";
import { useI18n } from "./i18n";

/**
 * The printable report for the scene the user has open. It used to be built with
 * no scene at all, so the exported PDF described the built-in RiMEA fixtures and
 * nothing of the user's project. The benchmark section still runs those fixtures:
 * it checks the engine, and the report says so.
 */
export function ValidationReportPanel({ scene }: { scene: CrowdSimScene }) {
  const { language } = useI18n();
  const [opened, setOpened] = useState(false);
  const report = useMemo(
    () => createValidationReport({ commercialScene: scene }),
    [scene],
  );
  const sceneName = report.sceneName;
  const aiSummary = useMemo(
    () => createAiValidationReportSummary(report, language),
    [language, report],
  );
  const exportBundle = useMemo(
    () => createValidationReportExportBundle(report, language),
    [language, report],
  );
  const passLabel = language === "zh" ? "通过" : "passed";
  const failLabel = language === "zh" ? "失败" : "failed";
  const title = language === "zh" ? "校准报告" : "Calibration report";
  const printLabel = language === "zh" ? "打印 / 导出 PDF" : "Print / export PDF";
  const note =
    language === "zh"
      ? `场景「${sceneName}」的商业参数校验；另附引擎回归基准（RiMEA 命名的自拟场景，与本场景无关）、Weidmann 密度-速度对比和 IMO 人群参数来源。`
      : `Commercial checks for "${sceneName}", plus engine regression fixtures (self-authored, RiMEA-named, independent of this scene), the Weidmann density-speed comparison, and IMO pedestrian preset sources.`;

  function openPrintableReport() {
    const blob = createReportBlob(exportBundle);
    const url = URL.createObjectURL(blob);

    window.open(url, "_blank", "noopener,noreferrer");
    setOpened(true);
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  return (
    <section className="probe-panel" aria-label={title}>
      <h3>{title}</h3>
      <p>{note}</p>
      <code>
        {report.benchmarkSummary.passCount}/{report.benchmarkSummary.totalCount}{" "}
        {passLabel} | {report.benchmarkSummary.failCount} {failLabel}
      </code>
      <code>
        PDF-ready {exportBundle.pdfReady ? "yes" : "no"} | {exportBundle.filename}
      </code>
      <code>
        physics error {report.residualProjectionValidation.baselineMeanError} |
        +residual {report.residualProjectionValidation.correctedMeanError} | in-sample{" "}
        {Math.round(report.residualProjectionValidation.improvementRatio * 100)}%
      </code>
      <p>
        {aiSummary.title}: {aiSummary.paragraphs[0]} Risk {aiSummary.riskLevel}
      </p>
      <button type="button" onClick={openPrintableReport}>
        {printLabel}
      </button>
      {opened ? (
        <span>{language === "zh" ? "已打开报告" : "Report opened"}</span>
      ) : null}
    </section>
  );
}
