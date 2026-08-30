import { describe, expect, it } from "vitest";
import { parseScene } from "@crowdsim/scene-schema";
import { rimeaCoreScenarios } from "./benchmarkScenarios";
import { createValidationReport, renderValidationReportHtml } from "./validationReport";
import { generateStoreLotsForZone } from "./storeLotGeneration";

describe("validation report", () => {
  it("combines benchmarks, speed-density points, presets, and references", () => {
    const report = createValidationReport({
      generatedAtIso: "2026-06-12T00:00:00.000Z",
    });

    expect(report.benchmarkResults).toHaveLength(4);
    expect(report.benchmarkSummary.totalCount).toBe(4);
    expect(report.residualProjectionValidation.modelSource).toBe("fitted-projection");
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
    expect(html).toContain("残差投影验证");
    expect(html).not.toContain("神经修正");
    expect(html).toContain("Physics + residual error");
    expect(html).toContain("in-sample fit, not held-out validation");
    expect(html).toContain("MSC.1/Circ.1533");
  });

  it("labels the residual section as a residual projection in English too", () => {
    const html = renderValidationReportHtml(
      createValidationReport({ generatedAtIso: "2026-06-12T00:00:00.000Z" }),
      "en",
    );

    expect(html).toContain("Residual projection validation");
    expect(html).not.toContain("Neural correction");
  });

  // The default suite grades the engine against ranges the project picked, so a
  // green summary proves nothing on its own; this pins the failing path instead.
  it("counts a benchmark the engine cannot satisfy as a failure", () => {
    const report = createValidationReport({
      generatedAtIso: "2026-06-12T00:00:00.000Z",
      scenarios: [
        {
          ...rimeaCoreScenarios[0],
          expectations: [
            {
              metric: "meanSpeedMetersPerSecond",
              range: { min: 99 },
              source: "self-authored",
            },
            { metric: "exitedCount", range: { min: 0 }, source: "self-authored" },
          ],
        },
      ],
    });

    expect(report.benchmarkSummary).toEqual({
      failCount: 1,
      passCount: 0,
      totalCount: 1,
    });
    expect(report.benchmarkResults[0].comparisons[0].pass).toBe(false);
    expect(report.benchmarkResults[0].comparisons[1].pass).toBe(true);
    expect(renderValidationReportHtml(report, "en")).toContain(">FAIL<");
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
