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
    // Mounts and unmounts every registered panel in one pass. Measured 2026-09-19:
    // about 12s on its own even after the movement step got a quarter cheaper,
    // because the cost is mounting ~13 panels, not stepping the crowd. The 20s
    // allowance is for a loaded or slower machine, not for the app being slow.
  }, 20_000);
});
