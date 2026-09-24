import { render } from "@testing-library/react";
import { defaultDemoScene } from "./defaultDemoScene";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "./i18n";
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

describe("template library panel is registered and renders", () => {
  // ai-workflow was deleted 2026-09-24: a disclosed-fake panel whose own
  // HONESTY NOTE said nothing in it called a model. project-workspace and
  // collaboration-status were deleted the same day alongside the entire
  // optional backend/collab package they existed to front -- undeployable
  // as shipped, unreachable from the client, real code nobody would
  // maintain. See docs/CLAIMS_LEDGER.md.
  for (const id of ["template-library"]) {
    it(`renders ${id}`, () => {
      const entry = panelRegistry.find((panel) => panel.id === id);
      expect(entry, `panel ${id} must be registered`).toBeDefined();
      const { container } = render(<I18nProvider>{entry!.render(ctx)}</I18nProvider>);
      expect((container.textContent ?? "").length).toBeGreaterThan(0);
    });
  }
});
