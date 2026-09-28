import { describe, expect, it } from "vitest";
import { isClick, screenToNdc } from "./agentPicking";

const rect = { left: 100, top: 50, width: 800, height: 600 };

describe("screenToNdc", () => {
  it("maps the canvas centre to the NDC origin", () => {
    const ndc = screenToNdc(100 + 400, 50 + 300, rect);
    expect(ndc.x).toBeCloseTo(0, 6);
    expect(ndc.y).toBeCloseTo(0, 6);
  });

  it("maps the top-left corner to (-1, 1)", () => {
    const ndc = screenToNdc(100, 50, rect);
    expect(ndc.x).toBeCloseTo(-1, 6);
    expect(ndc.y).toBeCloseTo(1, 6);
  });

  it("maps the bottom-right corner to (1, -1)", () => {
    const ndc = screenToNdc(900, 650, rect);
    expect(ndc.x).toBeCloseTo(1, 6);
    expect(ndc.y).toBeCloseTo(-1, 6);
  });
});

describe("isClick", () => {
  it("treats a tiny pointer movement as a click", () => {
    expect(isClick(2, 2)).toBe(true);
    expect(isClick(6, 0)).toBe(true);
  });

  it("treats a large movement as a drag, not a click", () => {
    expect(isClick(40, 10)).toBe(false);
    expect(isClick(0, 100)).toBe(false);
  });
});
