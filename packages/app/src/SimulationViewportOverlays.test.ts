import { createElement } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { bioCityDemoScene } from "./bioCityDemoScene";
import { ViewportCityLabelOverlay } from "./SimulationViewportOverlays";

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
