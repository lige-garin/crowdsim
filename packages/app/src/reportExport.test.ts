import { describe, expect, it } from "vitest";
import { createValidationReport } from "./validationReport";
import { createReportBlob, createValidationReportExportBundle } from "./reportExport";

describe("validation report export bundle", () => {
  it("creates a PDF-ready printable HTML export with reproducibility metadata", () => {
    const report = createValidationReport({
      generatedAtIso: "2026-06-12T00:00:00.000Z",
    });
    const bundle = createValidationReportExportBundle(report, "zh");

    expect(bundle.filename).toBe("crowdsim-v2-calibration-zh-2026-06-12.html");
    expect(bundle.pdfReady).toBe(true);
    expect(bundle.browserMatrix.map((browser) => browser.name)).toEqual([
      "Chrome",
      "Edge",
      "Safari",
    ]);
    expect(bundle.reproducibilityMatch).toBe(true);
    expect(bundle.contentDigest).toMatch(/^[0-9a-f]{16}$/);
    expect(bundle.html).toContain("CrowdSim V2 校准报告");
    expect(bundle.html).toContain("Physics + MLP error");
  });

  it("wraps printable report HTML in a text/html blob", async () => {
    const bundle = createValidationReportExportBundle(
      createValidationReport({
        generatedAtIso: "2026-06-12T00:00:00.000Z",
      }),
      "en",
    );
    const blob = createReportBlob(bundle);

    expect(blob.type).toBe("text/html");
    expect(await blob.text()).toContain("CrowdSim V2 calibration report");
  });
});
