import { describe, expect, it } from "vitest";
import {
  buildScenarioDiffReport,
  renderScenarioDiffReportHtml,
  type ScenarioRunSnapshot,
} from "./scenarioDiffReport";
import type { RunAnalyticsSummary } from "./runAnalytics";

function summary(overrides: Partial<RunAnalyticsSummary> = {}): RunAnalyticsSummary {
  return {
    elapsedSeconds: 600,
    flows: [],
    journeys: { count: 10, meanSeconds: 60, p50Seconds: 55, p90Seconds: 90 },
    levelOfService: {
      current: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 },
      peakAt: null,
      peakDensity: 1.2,
      peakLevel: "C",
      shareDOrWorse: 0.1,
    },
    places: [],
    samples: 600,
    ...overrides,
  };
}

function snapshot(
  id: string,
  name: string,
  overrides: Partial<ScenarioRunSnapshot> = {},
): ScenarioRunSnapshot {
  return { id, name, summary: summary(), ...overrides };
}

describe("buildScenarioDiffReport", () => {
  it("computes a delta and percent change for each metric", () => {
    const a = snapshot("scene-a", "Scenario A", {
      summary: summary({
        journeys: { count: 10, meanSeconds: 60, p50Seconds: 50, p90Seconds: 80 },
      }),
    });
    const b = snapshot("scene-b", "Scenario B", {
      summary: summary({
        journeys: { count: 10, meanSeconds: 60, p50Seconds: 40, p90Seconds: 80 },
      }),
    });

    const report = buildScenarioDiffReport(a, b);
    const p50 = report.metrics.find((m) => m.key === "journeyP50")!;
    expect(p50.scenarioAValue).toBe(50);
    expect(p50.scenarioBValue).toBe(40);
    expect(p50.delta).toBe(-10);
    expect(p50.deltaPercent).toBeCloseTo(-20, 5);
  });

  it("reports a null delta percent against a zero baseline instead of dividing by zero", () => {
    const a = snapshot("scene-a", "A", {
      summary: summary({
        levelOfService: {
          current: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 },
          peakAt: null,
          peakDensity: 0,
          peakLevel: "A",
          shareDOrWorse: 0,
        },
      }),
    });
    const b = snapshot("scene-b", "B", {
      summary: summary({
        levelOfService: {
          current: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 },
          peakAt: null,
          peakDensity: 2,
          peakLevel: "D",
          shareDOrWorse: 0.4,
        },
      }),
    });

    const report = buildScenarioDiffReport(a, b);
    const peakDensity = report.metrics.find((m) => m.key === "peakDensity")!;
    expect(peakDensity.delta).toBe(2);
    expect(peakDensity.deltaPercent).toBeNull();
  });

  it("omits evacuation clear time when either side is missing it", () => {
    const a = snapshot("scene-a", "A", { evacuationClearSeconds: 120 });
    const b = snapshot("scene-b", "B"); // no evacuation run

    const report = buildScenarioDiffReport(a, b);
    expect(report.metrics.some((m) => m.key === "evacuationClearSeconds")).toBe(false);
  });

  it("includes evacuation clear time when both sides have it", () => {
    const a = snapshot("scene-a", "A", { evacuationClearSeconds: 120 });
    const b = snapshot("scene-b", "B", { evacuationClearSeconds: 95 });

    const report = buildScenarioDiffReport(a, b);
    const clear = report.metrics.find((m) => m.key === "evacuationClearSeconds")!;
    expect(clear.scenarioAValue).toBe(120);
    expect(clear.scenarioBValue).toBe(95);
  });
});

describe("buildScenarioDiffReport: flow matching", () => {
  it("matches count lines by name, not id, since two independent scenes don't share ids", () => {
    const a = snapshot("scene-a", "A", {
      summary: summary({
        flows: [
          {
            backward: 5,
            forward: 20,
            id: "line-1-in-scene-a",
            name: "Main entrance",
            peakPerMinute: 8,
          },
        ],
      }),
    });
    const b = snapshot("scene-b", "B", {
      summary: summary({
        flows: [
          {
            backward: 6,
            forward: 25,
            id: "line-9-in-scene-b",
            name: "Main entrance",
            peakPerMinute: 10,
          },
        ],
      }),
    });

    const report = buildScenarioDiffReport(a, b);
    expect(report.flows).toEqual([
      {
        name: "Main entrance",
        scenarioAPeakPerMinute: 8,
        scenarioATotal: 25,
        scenarioBPeakPerMinute: 10,
        scenarioBTotal: 31,
        status: "matched",
      },
    ]);
  });

  it("reports a line present in only one scenario instead of silently dropping it", () => {
    const a = snapshot("scene-a", "A", {
      summary: summary({
        flows: [
          { backward: 0, forward: 10, id: "l1", name: "Side door", peakPerMinute: 3 },
        ],
      }),
    });
    const b = snapshot("scene-b", "B", {
      summary: summary({
        flows: [
          {
            backward: 2,
            forward: 15,
            id: "l2",
            name: "Loading dock",
            peakPerMinute: 5,
          },
        ],
      }),
    });

    const report = buildScenarioDiffReport(a, b);
    expect(report.flows).toEqual([
      { name: "Side door", scenarioATotal: 10, status: "onlyInA" },
      { name: "Loading dock", scenarioBTotal: 17, status: "onlyInB" },
    ]);
  });
});

describe("renderScenarioDiffReportHtml", () => {
  it("renders a printable HTML report naming both scenarios and every metric", () => {
    const report = buildScenarioDiffReport(
      snapshot("scene-a", "Baseline layout"),
      snapshot("scene-b", "Widened corridor"),
    );
    const html = renderScenarioDiffReportHtml(report, "en");

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("@media print");
    expect(html).toContain("Baseline layout");
    expect(html).toContain("Widened corridor");
    expect(html).toContain("Peak density");
    expect(html).toContain("Journey time P50");
  });

  it("renders in Chinese when asked", () => {
    const report = buildScenarioDiffReport(snapshot("a", "A"), snapshot("b", "B"));
    const html = renderScenarioDiffReportHtml(report, "zh");
    expect(html).toContain("情景对比报告");
  });

  it("escapes a scenario name that looks like a tag instead of injecting it raw", () => {
    const report = buildScenarioDiffReport(
      snapshot("a", "<script>alert(1)</script>"),
      snapshot("b", "B"),
    );
    const html = renderScenarioDiffReportHtml(report, "en");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
