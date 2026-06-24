import { describe, expect, it } from "vitest";
import { parseScene } from "@crowdsim/scene-schema";
import { createValidationReport, renderValidationReportHtml } from "./validationReport";
import { generateStoreLotsForZone } from "./storeLotGeneration";

describe("validation report", () => {
  it("combines benchmarks, speed-density points, presets, and references", () => {
    const report = createValidationReport({
      generatedAtIso: "2026-06-12T00:00:00.000Z",
    });

    expect(report.benchmarkSummary).toEqual({
      failCount: 0,
      passCount: 4,
      totalCount: 4,
    });
    expect(report.benchmarkResults).toHaveLength(4);
    expect(report.neuralCorrectionValidation.correctedMeanError).toBeLessThan(
      report.neuralCorrectionValidation.baselineMeanError,
    );
    expect(report.neuralCorrectionValidation.modelSource).toBe("fitted-projection");
    expect(report.speedDensityPoints).toHaveLength(4);
    expect(report.pedestrianPresetSummaries).toHaveLength(12);
    expect(report.referenceLinks.map((link) => link.label)).toEqual([
      "Weidmann 1993 pedestrian speed-density reference curve",
      "IMO MSC.1/Circ.1533, Annex 3, Tables 3.1, 3.4 and 3.5",
    ]);
  });

  it("renders a printable bilingual HTML report", () => {
    const report = createValidationReport({
      generatedAtIso: "2026-06-12T00:00:00.000Z",
    });
    const html = renderValidationReportHtml(report, "zh");

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("CrowdSim V2 校准报告");
    expect(html).toContain("@media print");
    expect(html).toContain("RiMEA straight corridor");
    expect(html).toContain("Weidmann");
    expect(html).toContain("神经修正验证");
    expect(html).toContain("Physics + residual error");
    expect(html).toContain("MSC.1/Circ.1533");
  });

  it("adds commercial validation when a commercial scene is supplied", () => {
    const commercialScene = generateStoreLotsForZone(
      parseScene({
        schemaVersion: "1.0.0",
        id: "report-commercial",
        name: "Report Commercial",
        seed: 4,
        world: { width: 40, height: 24 },
        zones: [
          {
            id: "jewelry-zone",
            category: "jewelry",
            geometry: {
              type: "polygon",
              points: [
                { x: 4, y: 4 },
                { x: 28, y: 4 },
                { x: 28, y: 16 },
                { x: 4, y: 16 },
              ],
            },
          },
        ],
      }),
      "jewelry-zone",
    ).scene;
    const report = createValidationReport({
      commercialScene,
      generatedAtIso: "2026-06-12T00:00:00.000Z",
    });
    const html = renderValidationReportHtml(report, "en");

    expect(report.commercialValidation?.shopCount).toBeGreaterThan(0);
    expect(html).toContain("Commercial behavior validation");
  });
});
