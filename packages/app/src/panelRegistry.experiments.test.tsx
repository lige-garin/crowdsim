import { render } from "@testing-library/react";
import { bioCityDemoScene } from "./bioCityDemoScene";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "./i18n";
import { panelRegistry } from "./panelRegistry";
import type { PanelDockContext } from "./panelRegistry";

const ctx = {
  scene: bioCityDemoScene,
  trajectoryRecording: {
    id: "t",
    runtime: {} as never,
    sceneId: "s",
    seed: 1,
    frames: [],
  },
} as unknown as PanelDockContext;

describe("experiment + analytics panels are registered and render", () => {
  // scenario-comparison was deleted 2026-09-24: ADR-0019 found it a
  // narrower, superseded predecessor of scenario-diff-report (it only
  // ranked parameter variants of one hardcoded fixture scene, never
  // compared two real scenarios). See docs/CLAIMS_LEDGER.md.
  for (const id of [
    "scenario-diff-report",
    "experiment-sweep",
    "experiment-summary",
    "sensitivity-screening",
    "validation-report",
  ]) {
    it(`renders ${id}`, () => {
      const entry = panelRegistry.find((panel) => panel.id === id);
      expect(entry, `panel ${id} must be registered`).toBeDefined();
      const { container } = render(<I18nProvider>{entry!.render(ctx)}</I18nProvider>);
      expect((container.textContent ?? "").length).toBeGreaterThan(0);
      // Some of these panels run whole simulations while rendering; under a
      // full parallel suite that exceeds the default 5 s.
    }, 30_000);
  }
});
