import { describe, expect, it } from "vitest";
import { boundedNelderMead } from "./boundedNelderMead";

describe("boundedNelderMead", () => {
  it("finds the known minimum of a simple bowl (sum of squared distance to a target)", () => {
    const target = { a: 3, b: -2 };
    const result = boundedNelderMead(
      ["a", "b"] as const,
      { a: [-10, 10], b: [-10, 10] },
      { a: 0, b: 0 },
      (p) => (p.a - target.a) ** 2 + (p.b - target.b) ** 2,
      { maxEvaluations: 200 },
    );

    expect(result.parameters.a).toBeCloseTo(target.a, 1);
    expect(result.parameters.b).toBeCloseTo(target.b, 1);
    expect(result.value).toBeLessThan(0.01);
  });

  it("never returns a parameter outside its own declared bounds", () => {
    // The minimum (10, 10) sits right at the corner of the box — the search
    // should clamp to it, not wander past.
    const result = boundedNelderMead(
      ["a", "b"] as const,
      { a: [0, 5], b: [0, 5] },
      { a: 1, b: 1 },
      (p) => (p.a - 10) ** 2 + (p.b - 10) ** 2,
      { maxEvaluations: 150 },
    );

    expect(result.parameters.a).toBeGreaterThanOrEqual(0);
    expect(result.parameters.a).toBeLessThanOrEqual(5);
    expect(result.parameters.b).toBeGreaterThanOrEqual(0);
    expect(result.parameters.b).toBeLessThanOrEqual(5);
    // Should have pushed to the corner nearest the true (out-of-bounds) minimum.
    expect(result.parameters.a).toBeGreaterThan(4);
    expect(result.parameters.b).toBeGreaterThan(4);
  });

  it("reports every evaluation through onEvaluation, at least once per starting vertex", () => {
    let calls = 0;
    boundedNelderMead(["a"] as const, { a: [0, 1] }, { a: 0.5 }, (p) => p.a ** 2, {
      maxEvaluations: 4,
      onEvaluation: () => calls++,
    });

    expect(calls).toBeGreaterThanOrEqual(2); // 1 parameter -> a 2-point starting simplex
  });
});
