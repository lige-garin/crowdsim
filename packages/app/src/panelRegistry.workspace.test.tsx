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

describe("workspace + collaboration panels are registered and render", () => {
  for (const id of [
    "project-workspace",
    "collaboration-status",
    "template-library",
    "ai-workflow",
  ]) {
    it(`renders ${id}`, () => {
      const entry = panelRegistry.find((panel) => panel.id === id);
      expect(entry, `panel ${id} must be registered`).toBeDefined();
      const { container } = render(<I18nProvider>{entry!.render(ctx)}</I18nProvider>);
      expect((container.textContent ?? "").length).toBeGreaterThan(0);
    });
  }
});
