import { useMemo, useState } from "react";
import { createAiValidationReportSummary } from "./aiReport";
import { createReportBlob, createValidationReportExportBundle } from "./reportExport";
import { createValidationReport } from "./validationReport";
import { useI18n } from "./i18n";

export function ValidationReportPanel() {
  const { language } = useI18n();
  const [opened, setOpened] = useState(false);
  const report = useMemo(() => createValidationReport(), []);
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
      ? "包含 RiMEA 回归基准、Weidmann 密度-速度对比和 IMO 人群参数来源。"
      : "Includes RiMEA regression fixtures, Weidmann density-speed comparison, and IMO pedestrian preset sources.";

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
        PDF-ready {exportBundle.pdfReady ? "yes" : "no"} |{" "}
        {exportBundle.browserMatrix.map((browser) => browser.name).join("/")} |{" "}
        {exportBundle.filename}
      </code>
      <code>
        physics error {report.neuralCorrectionValidation.baselineMeanError} | mlp{" "}
        {report.neuralCorrectionValidation.correctedMeanError} | improve{" "}
        {Math.round(report.neuralCorrectionValidation.improvementRatio * 100)}%
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
