import { describe, expect, it } from "vitest";
import { bioCityDemoScene } from "./bioCityDemoScene";
import {
  createBioCityAnalyticsAcceptanceAudit,
  createBioCityAnalyticsAcceptanceReport,
} from "./bioCityAnalyticsAcceptance";
import type { HeatmapCell } from "./heatmap";

describe("bioCityAnalyticsAcceptance", () => {
  it("tracks the Phase 3.8 analytics panel gate explicitly", () => {
    const report = createBioCityAnalyticsAcceptanceReport({
      elapsedSeconds: 1200,
      heatmapCells: acceptanceHeatmapCells,
      scene: bioCityDemoScene,
    });

    expect(report.map((item) => item.id)).toEqual([
      "heatmap-trend",
      "congestion-risk-metrics",
      "sales-forecast",
      "main-corridors",
      "building-property-cards",
      "transit-queues",
    ]);
    expect(report.every((item) => item.status === "complete")).toBe(true);
    expect(report.every((item) => item.completionPercent === 100)).toBe(true);
    expect(report.every((item) => item.evidence.length >= 3)).toBe(true);
  });

  it("does not leave blockers for the Phase 3.8 acceptance gate", () => {
    const audit = createBioCityAnalyticsAcceptanceAudit(
      createBioCityAnalyticsAcceptanceReport({
        elapsedSeconds: 1200,
        heatmapCells: acceptanceHeatmapCells,
        scene: bioCityDemoScene,
      }),
    );

    expect(audit).toEqual({
      blocksCompletion: false,
      completeCount: 6,
      completionPercent: 100,
      itemCount: 6,
      remainingBlockers: [],
    });
  });
});

const acceptanceHeatmapCells: HeatmapCell[] = [
  {
    count: 32,
    height: 4,
    id: "acceptance-peak",
    intensity: 1,
    width: 4,
    x: 92,
    y: 56,
  },
  {
    count: 18,
    height: 4,
    id: "acceptance-transit",
    intensity: 0.56,
    width: 4,
    x: 120,
    y: 72,
  },
];
