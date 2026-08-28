import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PanelDock } from "./PanelDock";
import { I18nProvider } from "./i18n";
import { panelRegistry } from "./panelRegistry";
import { createTrajectoryRecording } from "./trajectoryRecording";
import { bioCityDemoScene } from "./bioCityDemoScene";
import { createLiveSimulationRuntimeArtifact } from "./simulationRuntimeArtifact";

afterEach(cleanup);

function renderDock() {
  render(
    <I18nProvider>
      <PanelDock
        language="zh"
        context={{
          trajectoryRecording: createTrajectoryRecording({
            id: "test",
            runtime: createLiveSimulationRuntimeArtifact({
              movementBackend: "cpu-compat",
              sharedMemory: "fallback",
              thread: "main",
            }),
            sceneId: bioCityDemoScene.id,
            seed: bioCityDemoScene.seed,
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
    // Mounts and unmounts every registered panel in one pass; ~1.2s alone but
    // several seconds under a parallel full-suite run, so it needs headroom.
  }, 20_000);

  it("keeps the majority of panels honest about being fixtures", () => {
    // Guards against someone flipping the flags to silence the badge: the audit
    // found 11 of 13 panels building their own scenario.
    const fixtures = panelRegistry.filter((entry) => entry.dataSource === "fixture");

    expect(fixtures.length).toBeGreaterThanOrEqual(10);
  });
});
