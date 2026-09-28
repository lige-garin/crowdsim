import { render, within } from "@testing-library/react";
import { defaultDemoScene } from "../scenes/defaultDemoScene";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n";
import { PanelDock } from "./PanelDock";
import { panelRegistry } from "./panelRegistry";
import type { PanelDockContext } from "./panelRegistry";

const ctx = {
  scene: defaultDemoScene,
  trajectoryRecording: {
    id: "t",
    runtime: {} as never,
    sceneId: "s",
    seed: 1,
    frames: [],
  },
} as unknown as PanelDockContext;

function renderDock() {
  return render(
    <I18nProvider>
      <PanelDock language="en" context={ctx} />
    </I18nProvider>,
  );
}

describe("PanelDock", () => {
  it("renders a panels navigation region", () => {
    const { container } = renderDock();
    expect(
      within(container).getByRole("navigation", { name: /panels/i }),
    ).toBeInTheDocument();
  });

  it("renders exactly one nav button per registered panel", () => {
    const { container } = renderDock();
    const nav = within(container).getByRole("navigation", { name: /panels/i });
    expect(within(nav).getAllByRole("button").length).toBe(panelRegistry.length);
  });
});
