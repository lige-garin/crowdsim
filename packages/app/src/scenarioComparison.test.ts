import { describe, expect, it } from "vitest";
import { rimeaCoreScenarios } from "./benchmarkScenarios";
import { compareExperimentVariants, formatDeltaPercent } from "./scenarioComparison";

describe("scenario comparison", () => {
  it("compares variants against a baseline with ranks and deltas", () => {
    const comparison = compareExperimentVariants({
      id: "comparison-test",
      name: "Comparison test",
      replications: 2,
      scenario: rimeaCoreScenarios[0],
      variants: [
        {
          id: "baseline",
          name: "Baseline",
        },
        {
          id: "slow",
          name: "Slow",
          simulationOverrides: {
            speedMetersPerSecond: 0.85,
          },
        },
      ],
    });

    expect(comparison.rows).toHaveLength(2);
    expect(comparison.rows[0]).toMatchObject({
      rank: 1,
      throughputDeltaPercent: 0,
      variantId: "baseline",
    });
    expect(comparison.winner?.variantId).toBe("baseline");
    expect(comparison.rows[1].throughputDeltaPercent).toBeLessThan(0);
    expect(formatDeltaPercent(12.5)).toBe("+12.5%");
  });
});
