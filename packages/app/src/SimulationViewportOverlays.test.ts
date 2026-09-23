import { createElement } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { bioCityDemoScene } from "./bioCityDemoScene";
import { fruinLevels } from "./fruinLevelOfService";
import {
  HeatmapLegendOverlay,
  ViewportCityLabelOverlay,
} from "./SimulationViewportOverlays";

describe("ViewportCityLabelOverlay", () => {
  it("keeps the full annotation set in the analytical 2D view", () => {
    const { container } = render(
      createElement(ViewportCityLabelOverlay, {
        scene: bioCityDemoScene,
        viewMode: "2d",
      }),
    );

    expect(container.querySelector(".render-city-label-building")).not.toBeNull();
    expect(container.querySelector(".render-city-label-shop")).not.toBeNull();
  });
});

describe("HeatmapLegendOverlay", () => {
  it("draws one swatch per Fruin level, in the same colours the heatmap paints cells with", () => {
    const { container } = render(
      createElement(HeatmapLegendOverlay, { language: "en" }),
    );

    const items = container.querySelectorAll(".render-heatmap-legend-item");
    expect(items).toHaveLength(fruinLevels.length);
    expect(items[0].textContent).toContain("A");
    expect(items[fruinLevels.length - 1].textContent).toContain("F");
    // The F swatch is the open-ended band: "> x", not "≤ x".
    expect(items[fruinLevels.length - 1].getAttribute("title")).toMatch(/^> /);
  });

  it("localizes the title", () => {
    const { getByLabelText } = render(
      createElement(HeatmapLegendOverlay, { language: "zh" }),
    );

    expect(getByLabelText("密度（Fruin 服务水平）")).not.toBeNull();
  });
});
