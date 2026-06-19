import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "./i18n";
import { panelRegistry } from "./panelRegistry";
import type { PanelDockContext } from "./panelRegistry";
import { createTrajectoryRecording } from "./trajectoryRecording";
import { createLiveSimulationRuntimeArtifact } from "./simulationRuntimeArtifact";

const ctx: PanelDockContext = {
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

describe("imaging + tiles + trajectory panels are registered and render", () => {
  for (const id of ["image-geometry", "tiles-backdrop", "trajectory-replay"]) {
    it(`renders ${id}`, () => {
      const entry = panelRegistry.find((panel) => panel.id === id);
      expect(entry, `panel ${id} must be registered`).toBeDefined();
      const { container } = render(
        <I18nProvider>{entry!.render(ctx)}</I18nProvider>,
      );
      expect((container.textContent ?? "").length).toBeGreaterThan(0);
    });
  }
});
