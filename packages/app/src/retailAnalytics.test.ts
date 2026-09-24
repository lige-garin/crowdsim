import { describe, expect, it } from "vitest";
import { defaultDemoScene } from "./defaultDemoScene";
import { createRetailAnalyticsSummary } from "./retailAnalytics";
import type { HeatmapCell } from "./heatmap";

describe("retailAnalytics", () => {
  it("summarizes retail operating analytics from scene, weather, risks, and heatmap", () => {
    const heatmapCells: HeatmapCell[] = [
      {
        count: 32,
        densityPerSquareMeter: 2.0,
        level: "E",
        height: 4,
        id: "peak",
        intensity: 1,
        width: 4,
        x: 92,
        y: 56,
      },
      {
        count: 12,
        densityPerSquareMeter: 0.75,
        level: "D",
        height: 4,
        id: "secondary",
        intensity: 0.38,
        width: 4,
        x: 44,
        y: 52,
      },
    ];

    const summary = createRetailAnalyticsSummary({
      elapsedSeconds: 1200,
      heatmapCells,
      scene: defaultDemoScene,
    });

    expect(summary.heatmapPeak).toMatchObject({
      count: 32,
      id: "peak",
      intensity: 1,
    });
    expect(summary.heatmapTrend[0]).toEqual({
      id: "peak",
      intensityPercent: 100,
    });
    expect(summary.activeRiskCount).toBe(1);
    expect(summary.congestionIndexPercent).toBeGreaterThan(60);
    expect(summary.routeRiskIndexPercent).toBeGreaterThan(30);
    expect(summary.transitQueuePressurePercent).toBeGreaterThan(20);
    expect(summary.commercialConversionForecastPercent).toBeGreaterThan(40);
    expect(summary.salesForecastCards[0]).toMatchObject({
      id: "raincoat-pop-up",
      label: "Raincoat Pop-up",
    });
    expect(summary.transitStopCards[0]).toMatchObject({
      id: "rain-market-bus-stop",
      label: "Rain Market Bus Stop",
    });
    expect(summary.buildingPropertyCards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "glass-arcade",
          kind: "retail",
        }),
      ]),
    );
    expect(summary.riskExplanations.join(" ")).toContain("Curbside Pooling");
    expect(summary.weatherImpact.activeFactorIds).toEqual(
      expect.arrayContaining(["hazard-curbside-pooling"]),
    );
    expect(summary.topCorridors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "flow-rain-market-avenue-0",
          risk: true,
        }),
      ]),
    );
  });

  it("handles scenes without live heatmap or transit stops", () => {
    const summary = createRetailAnalyticsSummary({
      elapsedSeconds: 0,
      heatmapCells: [],
      scene: {
        ...defaultDemoScene,
        hazards: [],
        transitStops: [],
      },
    });

    expect(summary.heatmapPeak).toMatchObject({
      count: 0,
      id: "none",
      intensity: 0,
    });
    expect(summary.activeRiskCount).toBe(0);
    expect(summary.transitQueuePressurePercent).toBe(0);
    expect(summary.transitStopCards).toEqual([]);
  });
});
