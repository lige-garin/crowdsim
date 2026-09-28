import { describe, expect, it } from "vitest";
import { defaultDemoScene } from "../scenes/defaultDemoScene";
import { createViewportOverlayPlan } from "./viewportOverlayPlan";
import type { HeatmapCell } from "../analytics/heatmap";

describe("viewportOverlayPlan", () => {
  it("creates sorted heatmap overlays with stable opacity and colors", () => {
    const heatmapCells: HeatmapCell[] = [
      {
        count: 4,
        densityPerSquareMeter: 0.25,
        level: "A",
        height: 4,
        id: "low",
        intensity: 0.2,
        width: 4,
        x: 12,
        y: 16,
      },
      {
        count: 20,
        densityPerSquareMeter: 1.25,
        level: "E",
        height: 4,
        id: "peak",
        intensity: 1,
        width: 4,
        x: 40,
        y: 52,
      },
    ];

    const plan = createViewportOverlayPlan(defaultDemoScene, {
      heatmapCells,
      maxHeatmapCells: 1,
    });

    expect(plan.heatmap).toEqual([
      expect.objectContaining({
        // 1.25 P/m² is Fruin level E.
        color: "#fc8d59",
        id: "viewport-peak",
        intensity: 1,
        opacity: 0.66,
      }),
    ]);
    expect(plan.summary.heatmapCellCount).toBe(1);
    expect(plan.summary.peakHeatmapIntensity).toBe(1);
  });

  it("marks active hazards as risk overlays and raises affected road flow risk", () => {
    const plan = createViewportOverlayPlan(defaultDemoScene, {
      elapsedSeconds: 1200,
    });

    expect(plan.risks).toEqual([
      expect.objectContaining({
        active: true,
        color: "#ef4444",
        id: "risk-curbside-pooling",
        riskScore: 0.24,
        severity: 0.42,
      }),
    ]);
    expect(plan.summary.activeRiskCount).toBe(1);
    expect(
      plan.flows.find((flow) => flow.id === "flow-rain-market-avenue-0"),
    ).toMatchObject({
      color: "#ef4444",
      intensity: 1,
      transitOnly: false,
    });
  });

  it("keeps inactive hazards visible but less prominent and distinguishes transit flow", () => {
    const plan = createViewportOverlayPlan(defaultDemoScene, {
      elapsedSeconds: 300,
    });

    expect(plan.risks).toEqual([
      expect.objectContaining({
        active: false,
        color: "#f97316",
        opacity: 0.1,
      }),
    ]);
    expect(plan.summary.activeRiskCount).toBe(0);
    expect(plan.flows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          color: "#38bdf8",
          id: "flow-bus-loop-0",
          transitOnly: true,
        }),
      ]),
    );
  });
});
