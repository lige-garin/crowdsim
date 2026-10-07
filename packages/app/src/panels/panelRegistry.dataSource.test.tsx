import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
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

  it("keys the scene-bound panels by scene id", () => {
    // A live panel that keeps state across a scene swap shows one scene's
    // numbers under another scene's name — a form filled in for one shop,
    // applied to another. Keying by scene id makes the swap a fresh mount.
    // Checked by rerendering the real registry output across two scenes and
    // looking for the form coming back empty, because React's key string is
    // an implementation detail and asserting on it would test React.
    const other = parseScene({
      ...defaultDemoScene,
      id: "second-scene",
      shops: defaultDemoScene.shops.map((shop) => ({
        ...shop,
        id: `${shop.id}-2`,
        name: `${shop.name ?? shop.id}二号店`,
      })),
    });

    for (const id of ["shop-layout", "layout-compare"]) {
      cleanup();
      const entry = panelRegistry.find((panel) => panel.id === id)!;
      const nameInput = () =>
        screen.queryByTestId("shop-layout-name") as HTMLInputElement | null;

      const { rerender } = render(
        <I18nProvider>{entry.render(contextFor(defaultDemoScene))}</I18nProvider>,
      );

      if (!nameInput()) continue; // a report panel has no form to carry over

      fireEvent.change(nameInput()!, { target: { value: "写进去的名字" } });
      rerender(<I18nProvider>{entry.render(contextFor(other))}</I18nProvider>);

      expect(
        nameInput()?.value,
        `${id} kept a form filled in for the previous scene`,
      ).not.toBe("写进去的名字");
    }
  });
});

function contextFor(scene: CrowdSimScene) {
  return {
    scene,
    trajectoryRecording: createTrajectoryRecording({
      id: "test",
      runtime: createLiveSimulationRuntimeArtifact({
        movementBackend: "cpu-compat",
        sharedMemory: "fallback",
        thread: "main",
      }),
      sceneId: scene.id,
      seed: scene.seed,
    }),
  };
}
