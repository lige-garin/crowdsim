import { fireEvent, render, within } from "@testing-library/react";
import { bioCityDemoScene } from "./bioCityDemoScene";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "./i18n";
import { PanelDock } from "./PanelDock";
import { panelRegistry } from "./panelRegistry";
import type { PanelDockContext } from "./panelRegistry";
import { createTrajectoryRecording } from "./trajectoryRecording";
import { createLiveSimulationRuntimeArtifact } from "./simulationRuntimeArtifact";

const ctx: PanelDockContext = {
  scene: bioCityDemoScene,
  trajectoryRecording: createTrajectoryRecording({
    id: "test-rec",
    runtime: createLiveSimulationRuntimeArtifact({
      movementBackend: "cpu-compat",
      sharedMemory: "fallback",
      thread: "main",
    }),
    sceneId: "s",
    seed: 1,
  }),
};

describe("PanelDock interaction", () => {
  it("activates and renders each registered panel when its nav button is clicked", () => {
    const { container } = render(
      <I18nProvider>
        <PanelDock language="en" context={ctx} />
      </I18nProvider>,
    );
    const nav = within(container).getByRole("navigation", { name: /panels/i });

    for (const entry of panelRegistry) {
      const button = within(nav).getByText(entry.labelEn);
      fireEvent.click(button);
      expect(button.getAttribute("aria-pressed"), entry.id).toBe("true");
      const body = container.querySelector(".panel-dock-body");
      expect((body?.textContent ?? "").length, entry.id).toBeGreaterThan(0);
    }
    // Renders every registered panel in one pass; ~1.2s alone but several
    // seconds when the whole suite runs in parallel, so it needs headroom over
    // the 5s default.
  }, 20_000);
});
