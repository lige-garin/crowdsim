import { describe, expect, it } from "vitest";
import { createValidationReport } from "./validationReport";
import { createReportBlob, createValidationReportExportBundle } from "./reportExport";

function createReport() {
  return createValidationReport({ generatedAtIso: "2026-06-12T00:00:00.000Z" });
}

describe("validation report export bundle", () => {
  it("creates a PDF-ready printable HTML export with reproducibility metadata", () => {
    const bundle = createValidationReportExportBundle(createReport(), "zh");

    expect(bundle.filename).toBe("crowdsim-v2-calibration-zh-2026-06-12.html");
    expect(bundle.pdfReady).toBe(true);
    expect(bundle.contentDigest).toMatch(/^[0-9a-f]{16}$/);
    expect(bundle.html).toContain("CrowdSim V2 校准报告");
    expect(bundle.html).toContain("Physics + residual error");
  });

  it("reports reproducibility as not compared when no baseline is supplied", () => {
    const bundle = createValidationReportExportBundle(createReport(), "zh");

    expect(bundle.reproducibilityComparison).toEqual({ status: "not-compared" });
  });

  it("matches a baseline contract captured from an identical build", () => {
    const baseline = createValidationReportExportBundle(
      createReport(),
      "zh",
    ).reproducibility;
    const bundle = createValidationReportExportBundle(createReport(), "zh", {
      baselineReproducibility: baseline,
    });

    expect(bundle.reproducibilityComparison).toEqual({
      match: true,
      mismatches: [],
      status: "compared",
    });
  }, 20_000);

  it("flags every scenario whose hash drifted from the baseline", () => {
    const report = createReport();
    const drifted = createValidationReportExportBundle(report, "zh").reproducibility;
    const [firstScenarioId] = Object.keys(drifted.hashes);
    const baseline = {
      ...drifted,
      hashes: { ...drifted.hashes, [firstScenarioId]: "deadbeef", missing: "cafe" },
    };
    const bundle = createValidationReportExportBundle(report, "zh", {
      baselineReproducibility: baseline,
    });

    expect(bundle.reproducibilityComparison).toEqual({
      match: false,
      mismatches: [
        {
          baselineHash: "deadbeef",
          candidateHash: drifted.hashes[firstScenarioId],
          scenarioId: firstScenarioId,
        },
        { baselineHash: "cafe", candidateHash: null, scenarioId: "missing" },
      ],
      status: "compared",
    });
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
