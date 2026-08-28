import { describe, expect, it } from "vitest";
import { editorTools } from "./sceneEditorState";
import { viewportLayerIds } from "./viewportLayers";
import { workspacePaletteEntries, workspacePaletteGroups } from "./workspacePalette";

describe("workspacePalette", () => {
  it("resolves every entry to a real editor tool or viewport layer", () => {
    // This is the guard against the palette drifting back into decoration: the
    // grid it replaced had 16 buttons and 0 consumers.
    for (const entry of workspacePaletteEntries()) {
      if (entry.kind === "editor") {
        expect(editorTools).toContain(entry.tool);
      } else {
        expect(viewportLayerIds).toContain(entry.layer);
      }
    }
  });

  it("uses unique ids and labels both languages", () => {
    const entries = workspacePaletteEntries();
    const ids = entries.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of entries) {
      expect(entry.label.zh.trim().length).toBeGreaterThan(0);
      expect(entry.label.en.trim().length).toBeGreaterThan(0);
      expect(entry.label.zh).not.toEqual(entry.label.en);
    }
  });

  it("keeps every group non-empty and titled in both languages", () => {
    expect(workspacePaletteGroups.length).toBeGreaterThan(0);
    for (const group of workspacePaletteGroups) {
      expect(group.entries.length).toBeGreaterThan(0);
      expect(group.title.zh.trim().length).toBeGreaterThan(0);
      expect(group.title.en.trim().length).toBeGreaterThan(0);
    }
  });
});
