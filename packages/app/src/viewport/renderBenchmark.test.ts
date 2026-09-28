import { describe, expect, it } from "vitest";
import {
  benchmarkAgentPosition,
  performanceAgentCount,
  performanceGridColumns,
  performanceGridRows,
} from "./renderBenchmark";

describe("render benchmark", () => {
  it("targets a 100k agent benchmark grid", () => {
    expect(performanceAgentCount).toBe(100_000);
    expect(performanceGridColumns * performanceGridRows).toBeGreaterThanOrEqual(
      performanceAgentCount,
    );
  });

  it("keeps benchmark positions inside a compact viewport", () => {
    const first = benchmarkAgentPosition(0);
    const last = benchmarkAgentPosition(performanceAgentCount - 1);

    expect(Math.abs(first.x)).toBeLessThan(24);
    expect(Math.abs(first.y)).toBeLessThan(24);
    expect(Math.abs(last.x)).toBeLessThan(24);
    expect(Math.abs(last.y)).toBeLessThan(24);
  });
});
