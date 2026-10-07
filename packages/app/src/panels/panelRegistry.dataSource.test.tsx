import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PanelDock } from "./PanelDock";
import { I18nProvider } from "../i18n";
import { panelRegistry } from "./panelRegistry";
import { createTrajectoryRecording } from "../analytics/trajectoryRecording";
import { defaultDemoScene } from "../scenes/defaultDemoScene";
import { createLiveSimulationRuntimeArtifact } from "../engine/simulationRuntimeArtifact";

afterEach(cleanup);

function renderDock() {
  render(
    <I18nProvider>
      <PanelDock
        language="zh"
        context={{
          scene: defaultDemoScene,
          trajectoryRecording: createTrajectoryRecording({
            id: "test",
            runtime: createLiveSimulationRuntimeArtifact({
              movementBackend: "cpu-compat",
              sharedMemory: "fallback",
              thread: "main",
            }),
            sceneId: defaultDemoScene.id,
            seed: defaultDemoScene.seed,
          }),
        }}
      />
    </I18nProvider>,
  );
}

describe("panel dock data-source labelling", () => {
  it("labels every fixture panel and no live panel", () => {
    for (const entry of panelRegistry) {
      cleanup();
      renderDock();
      fireEvent.click(screen.getByTestId(`panel-chip-${entry.id}`));

      const badge = screen.queryByTestId("panel-source-fixture");

      if (entry.dataSource === "fixture") {
        expect(badge, `${entry.id} must be labelled as sample data`).not.toBeNull();
      } else {
        expect(
          badge,
          `${entry.id} reads live data and must not be labelled`,
        ).toBeNull();
      }
    }
    // Mounts and unmounts every registered panel in one pass. Measured 2026-09-19:
    // about 12s on its own even after the movement step got a quarter cheaper,
    // because the cost is mounting ~13 panels, not stepping the crowd. The 20s
    // allowance is for a loaded or slower machine, not for the app being slow.
  }, 20_000);

  it("names every panel allowed to call itself live", () => {
    // Guards against someone flipping a flag to silence the badge: the audit
    // found 11 of 13 panels building their own scenario. Making a panel live
    // means wiring it to the running scene, and then naming it here.
    const live = panelRegistry
      .filter((entry) => entry.dataSource === "live")
      .map((entry) => entry.id)
      .sort();

    expect(live).toEqual([
      "brand-intelligence",
      // Runs the two saved schemes off the open scene's own machinery; it
      // reads no fixture.
      "layout-compare",
      // Reports on the open scene's shops and writes a layout back into it.
      "shop-layout",
      "trajectory-replay",
      // Reports on the open scene since the report panel was given it.
      "validation-report",
      // Reads the open scene's weatherProfile.location as a starting point
      // and, when wired to onApplyScene, writes real fetched weather back
      // into it.
      "weather",
    ]);
  });
});
