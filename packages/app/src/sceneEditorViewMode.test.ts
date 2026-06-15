import { describe, expect, it } from "vitest";
import { demoScene } from "./demoScene";
import { toggleEditorViewMode } from "./sceneEditorViewMode";

describe("scene editor view mode", () => {
  it("toggles between precise top-down editing and isometric preview", () => {
    const isometric = toggleEditorViewMode(demoScene);
    const topDown = toggleEditorViewMode(isometric);

    expect(isometric.visual.defaultView).toBe("isometric");
    expect(topDown.visual.defaultView).toBe("topDown");
  });
});
