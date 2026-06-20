import { describe, expect, it } from "vitest";
import { facadeWindows } from "./buildingFacade";

describe("facadeWindows", () => {
  it("lays out a grid of windows scaled to the facade size", () => {
    const windows = facadeWindows(10, 3);
    expect(windows.length).toBeGreaterThan(1);
    // 10 / 3.2 -> 3 cols, 3 / 1 -> 3 rows
    expect(windows).toHaveLength(9);
  });

  it("keeps every window inside the facade rectangle", () => {
    const facadeWidth = 12;
    const buildingHeight = 4;
    for (const w of facadeWindows(facadeWidth, buildingHeight)) {
      expect(Math.abs(w.offset) + w.width / 2).toBeLessThanOrEqual(facadeWidth / 2 + 1e-9);
      expect(w.vertical - w.height / 2).toBeGreaterThanOrEqual(-1e-9);
      expect(w.vertical + w.height / 2).toBeLessThanOrEqual(buildingHeight + 1e-9);
    }
  });

  it("always yields at least one window for a small facade", () => {
    expect(facadeWindows(1, 0.5)).toHaveLength(1);
  });

  it("returns nothing for a degenerate facade", () => {
    expect(facadeWindows(0, 3)).toEqual([]);
    expect(facadeWindows(8, 0)).toEqual([]);
  });

  it("gives bigger buildings more windows than smaller ones", () => {
    expect(facadeWindows(20, 6).length).toBeGreaterThan(facadeWindows(4, 1.5).length);
  });
});
