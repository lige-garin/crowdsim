import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "./i18n";
import { panelRegistry } from "./panelRegistry";
import type { PanelDockContext } from "./panelRegistry";

const ctx = {
  trajectoryRecording: {
    id: "t",
    runtime: {} as never,
    sceneId: "s",
    seed: 1,
    frames: [],
  },
} as unknown as PanelDockContext;

describe("brand + calibration panels are registered and render", () => {
  for (const id of ["brand-intelligence", "neural-correction", "scale-readiness"]) {
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
