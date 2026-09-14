import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { bioCityDemoScene } from "./bioCityDemoScene";
import { BioCityAnalyticsPanel } from "./BioCityAnalyticsPanel";
import { I18nProvider } from "./i18n";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderIn(language: "en" | "zh") {
  localStorage.setItem("crowdsim.language", language);
  return render(
    <I18nProvider>
      <BioCityAnalyticsPanel
        elapsedSeconds={120}
        heatmapCells={[]}
        scene={bioCityDemoScene}
      />
    </I18nProvider>,
  );
}

describe("BioCityAnalyticsPanel", () => {
  it("speaks English in English mode", () => {
    const { container } = renderIn("en");
    expect(screen.getByRole("heading", { name: "Operations" })).toBeInTheDocument();
    // Scene data (shop names) is not interface copy; only check the chrome.
    const chrome = [
      ...container.querySelectorAll("h2, h3, .eyebrow, .dashboard-metric span"),
    ]
      .map((element) => element.textContent ?? "")
      .join(" ");
    expect(chrome).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("does not present the revenue index as money", () => {
    const { container } = renderIn("zh");
    expect(container.textContent).not.toContain("¥");
  });
});
