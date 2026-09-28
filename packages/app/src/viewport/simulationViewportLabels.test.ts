import { describe, expect, it } from "vitest";
import { deconflictLabels } from "./simulationViewportLabels";

describe("deconflictLabels", () => {
  it("separates labels stacked on the same spot", () => {
    const result = deconflictLabels([
      { id: "a", leftPercent: 50, topPercent: 40 },
      { id: "b", leftPercent: 50, topPercent: 40 },
      { id: "c", leftPercent: 50, topPercent: 41 },
    ]);
    const tops = result.map((r) => r.topPercent).sort((x, y) => x - y);
    for (let i = 1; i < tops.length; i++) {
      expect(tops[i] - tops[i - 1]).toBeGreaterThanOrEqual(3.39);
    }
  });

  it("leaves well-separated labels untouched", () => {
    const result = deconflictLabels([
      { id: "a", leftPercent: 10, topPercent: 20 },
      { id: "b", leftPercent: 80, topPercent: 60 },
    ]);
    expect(result.find((r) => r.id === "a")?.topPercent).toBe(20);
    expect(result.find((r) => r.id === "b")?.topPercent).toBe(60);
  });

  it("does not move labels that share a row but are far apart horizontally", () => {
    const result = deconflictLabels([
      { id: "a", leftPercent: 10, topPercent: 30 },
      { id: "b", leftPercent: 70, topPercent: 30 },
    ]);
    expect(result.find((r) => r.id === "b")?.topPercent).toBe(30);
  });
});
