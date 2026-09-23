import { render } from "@testing-library/react";
import { bioCityDemoScene } from "./bioCityDemoScene";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "./i18n";
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

describe("trajectory panel is registered and renders", () => {
  // image-geometry and tiles-backdrop were deleted 2026-09-24: both were
  // disclosed-fake fixtures (a hand-written fixture repainted over any
  // upload, and a stub 3D-tiles config), see docs/CLAIMS_LEDGER.md.
  for (const id of ["trajectory-replay"]) {
    it(`renders ${id}`, () => {
      const entry = panelRegistry.find((panel) => panel.id === id);
      expect(entry, `panel ${id} must be registered`).toBeDefined();
      const { container } = render(<I18nProvider>{entry!.render(ctx)}</I18nProvider>);
      expect((container.textContent ?? "").length).toBeGreaterThan(0);
    });
  }
});
