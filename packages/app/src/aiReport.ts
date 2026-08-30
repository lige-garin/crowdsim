// HONESTY NOTE (see docs/CLAIMS_LEDGER.md): this summary contains no AI. It is
// two arithmetic expressions over the validation report -- a benchmark pass rate
// and the largest density-speed delta -- rendered into fixed sentence templates.
// It used to be titled "AI 校准摘要" / "AI calibration summary", which read as a
// model's assessment of the calibration. It is renamed to state what it is,
// because this text is exported into the shareable validation report, where an
// "AI" label on an unverified evacuation number carries real legal weight.
// Frozen 2026-08-30: do not reintroduce "AI" until a model actually runs here.
import type { ValidationReport, ValidationReportLanguage } from "./validationReport";

export type AiReportSummary = {
  language: ValidationReportLanguage;
  paragraphs: string[];
  riskLevel: "high" | "low" | "medium";
  title: string;
};

export function createAiValidationReportSummary(
  report: ValidationReport,
  language: ValidationReportLanguage,
): AiReportSummary {
  const passRate =
    report.benchmarkSummary.totalCount > 0
      ? report.benchmarkSummary.passCount / report.benchmarkSummary.totalCount
      : 0;
  const maxSpeedDelta = Math.max(
    0,
    ...report.speedDensityPoints.map((point) =>
      Math.abs(point.speedDeltaMetersPerSecond),
    ),
  );
  const riskLevel = passRate < 0.8 ? "high" : maxSpeedDelta > 0.8 ? "medium" : "low";

  if (language === "zh") {
    return {
      language,
      paragraphs: [
        `基准通过 ${report.benchmarkSummary.passCount}/${report.benchmarkSummary.totalCount}，失败 ${report.benchmarkSummary.failCount}。`,
        `密度-速度曲线最大偏差约 ${maxSpeedDelta.toFixed(2)} m/s。`,
        "当前报告适合作为工程回归与校准记录，不等同于正式认证报告。",
      ],
      riskLevel,
      title: "校准摘要",
    };
  }

  return {
    language,
    paragraphs: [
      `${report.benchmarkSummary.passCount}/${report.benchmarkSummary.totalCount} benchmarks passed with ${report.benchmarkSummary.failCount} failures.`,
      `The largest density-speed delta is approximately ${maxSpeedDelta.toFixed(2)} m/s.`,
      "This report is suitable for engineering regression and calibration notes, not formal certification.",
    ],
    riskLevel,
    title: "Calibration summary",
  };
}
