import { describe, expect, it } from "vitest";
import { runCorridorSpeedTest } from "./test01Corridor";

describe("test 1: walking speed in a corridor", () => {
  it("judges the median walk and reports how far the spread reaches", () => {
    const result = runCorridorSpeedTest(6);

    expect(result.number).toBe(1);
    expect(result.measured).toMatch(/median .* s over \d+ walks/u);
    // The share inside the window is the point: this engine's 19% speed
    // spread is wider than the 5% the window was built from, and the result
    // says so instead of hiding it behind a pass.
    expect(result.measured).toMatch(/inside the window/u);
    expect(result.criterion).toContain("26-34 s");
    expect(result.criterion).toContain("19% spread");
  });
});
