import { describe, expect, it } from "vitest";
import { rimeaCoreScenarios } from "./benchmarkScenarios";
import {
  rankExperimentVariants,
  runExperiment,
  summarizeExperimentResults,
} from "./experimentRunner";

describe("experiment runner", () => {
  it("runs variants across Monte Carlo replications", () => {
    const results = runExperiment({
      id: "corridor-speed-sweep",
      name: "Corridor speed sweep",
      replications: 3,
      scenario: rimeaCoreScenarios[0],
      variants: [
        {
          id: "baseline",
          name: "Baseline",
        },
        {
          id: "slow",
          name: "Slow crowd",
          simulationOverrides: {
            speedMetersPerSecond: 0.9,
          },
        },
      ],
    });

    expect(results).toHaveLength(6);
    expect(results.map((result) => result.replicationIndex)).toEqual([
      0, 1, 2, 0, 1, 2,
    ]);
    expect(
      new Set(results.map((result) => result.benchmark.reproducibilityHash)).size,
    ).toBeGreaterThan(1);
  });

  it("summarizes and ranks scenario variants", () => {
    const results = runExperiment({
      id: "corridor-speed-rank",
      name: "Corridor speed rank",
      replications: 2,
      scenario: rimeaCoreScenarios[0],
      variants: [
        {
          id: "baseline",
          name: "Baseline",
        },
        {
          id: "slow",
          name: "Slow crowd",
          simulationOverrides: {
            speedMetersPerSecond: 0.9,
          },
        },
      ],
    });
    const summaries = summarizeExperimentResults(results);
    const ranking = rankExperimentVariants(summaries);

    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toMatchObject({
      replicationCount: 2,
      variantId: "baseline",
    });
    expect(ranking[0].throughputMean).toBeGreaterThanOrEqual(ranking[1].throughputMean);
  });
});
