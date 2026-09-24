import { describe, expect, it } from "vitest";
import { bottleneckTest, runBottleneckTest } from "./test12Bottleneck";

describe("test 12: bottleneck flow", () => {
  it("reports all four sub-tests (a-d), cheaply", () => {
    const result = runBottleneckTest({ people: 30 });

    expect(result.number).toBe(12);
    expect(result.status).toBe("pass");
    expect(result.measured).toContain("12a");
    expect(result.measured).toContain("12b");
    expect(result.measured).toContain("12c");
    expect(result.measured).toContain("12d");
    // The bottleneck widths this project could actually route through are
    // disclosed, not silently substituted for the guideline's own.
    expect(result.criterion).toContain("router");
  }, 30_000);

  it("uses the guideline's own room size and a router-limited bottleneck width", () => {
    // A 4, pp. 37-41: the real value (1 m) does not route on this project's
    // grid, so 2.4 m stands in for it everywhere except 12d, which is what
    // the wide comment above `bottleneckTest` explains.
    expect(bottleneckTest.room1SizeMeters).toBe(10);
    expect(bottleneckTest.defaultBottleneckWidthMeters).toBe(2.4);
  });
});
