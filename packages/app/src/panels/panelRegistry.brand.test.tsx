import { render } from "@testing-library/react";
import { defaultDemoScene } from "../scenes/defaultDemoScene";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n";
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

describe("brand panel is registered and renders", () => {
  // scale-readiness was deleted 2026-09-24: a fixture panel of projected
  // capacity constants, not a measurement -- and the sole real consumer of
  // demoMode.ts/photorealisticTiles.ts/visualAssets.ts/scaleBudget.ts, all
  // deleted alongside it. See docs/CLAIMS_LEDGER.md.
  for (const id of ["brand-intelligence"]) {
    it(`renders ${id}`, () => {
      const entry = panelRegistry.find((panel) => panel.id === id);
      expect(entry, `panel ${id} must be registered`).toBeDefined();
      const { container } = render(<I18nProvider>{entry!.render(ctx)}</I18nProvider>);
      expect((container.textContent ?? "").length).toBeGreaterThan(0);
    });
  }
});
