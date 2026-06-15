import { describe, expect, it } from "vitest";
import { createAiValidationReportSummary } from "./aiReport";
import { createValidationReport } from "./validationReport";

describe("AI report summary", () => {
  it("summarizes calibration reports in Chinese and English", () => {
    const report = createValidationReport({
      generatedAtIso: "2026-06-12T00:00:00.000Z",
    });
    const zh = createAiValidationReportSummary(report, "zh");
    const en = createAiValidationReportSummary(report, "en");

    expect(zh.title).toBe("AI 校准摘要");
    expect(zh.paragraphs[0]).toContain("基准通过 4/4");
    expect(en.title).toBe("AI calibration summary");
    expect(en.paragraphs[2]).toContain("not formal certification");
    expect(en.riskLevel).toMatch(/low|medium|high/);
  });
});
