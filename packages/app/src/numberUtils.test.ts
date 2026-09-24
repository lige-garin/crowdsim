import { describe, expect, it } from "vitest";
import { clamp, lerp, mean } from "./numberUtils";

describe("numberUtils", () => {
  it("clamp keeps a value within range and re-exports the core-gpu implementation", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("lerp interpolates linearly between two values", () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
  });

  it("mean averages a list of numbers", () => {
    expect(mean([1, 2, 3])).toBe(2);
  });

  it("mean returns 0 for an empty list rather than NaN", () => {
    expect(mean([])).toBe(0);
  });
});
