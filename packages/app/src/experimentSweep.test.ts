import { describe, expect, it } from "vitest";
import { rimeaCoreScenarios } from "./benchmarkScenarios";
import { runExperiment } from "./experimentRunner";
import {
  bootstrapMeanInterval,
  createExperimentFromSweep,
  summarizeMonteCarloDistribution,
} from "./experimentSweep";
import { mulberry32 } from "./simulationEngineRandom";

describe("experiment sweep", () => {
  it("generates parameter-sweep variants", () => {
    const experiment = createExperimentFromSweep({
      id: "speed-sweep",
      name: "Speed sweep",
      parameter: {
        end: 1.5,
        kind: "speed",
        start: 0.9,
        step: 0.3,
      },
      replications: 2,
      scenario: rimeaCoreScenarios[0],
    });

    expect(experiment.variants.map((variant) => variant.id)).toEqual([
      "speed-0_9",
      "speed-1_2",
      "speed-1_5",
    ]);
  });

  it("generates entrance-width scene variants", () => {
    const experiment = createExperimentFromSweep({
      id: "exit-width-sweep",
      name: "Exit width sweep",
      parameter: {
        end: 4,
        kind: "entrance-width",
        start: 2,
        step: 1,
        targetEntranceId: "east-sink",
      },
      replications: 1,
      scenario: rimeaCoreScenarios[0],
    });

    expect(
      experiment.variants.map(
        (variant) =>
          variant.scene?.entrances.find((entrance) => entrance.id === "east-sink")
            ?.width,
      ),
    ).toEqual([2, 3, 4]);
  });

  it("summarizes Monte Carlo distributions with p95", () => {
    const experiment = createExperimentFromSweep({
      id: "agent-cap-sweep",
      name: "Agent cap sweep",
      parameter: {
        end: 600,
        kind: "max-agents",
        start: 300,
        step: 300,
      },
      replications: 3,
      scenario: rimeaCoreScenarios[0],
    });
    const results = runExperiment(experiment);
    const distribution = summarizeMonteCarloDistribution(results);

    expect(Object.keys(distribution)).toEqual(["max-agents-300", "max-agents-600"]);
    expect(distribution["max-agents-300"].samples).toHaveLength(3);
    expect(distribution["max-agents-300"].p95).toBeGreaterThanOrEqual(
      distribution["max-agents-300"].p50,
    );
  });
});

describe("confidence intervals for a Monte Carlo sweep", () => {
  /** A normal draw with a known mean, so coverage can be checked. */
  function normalSamples(count: number, mean: number, sd: number, seed: number) {
    const random = mulberry32(seed);
    const values: number[] = [];

    for (let index = 0; index < count; index += 1) {
      const u1 = Math.max(random(), 1e-12);
      const u2 = random();
      values.push(
        mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2),
      );
    }

    return values;
  }

  it("covers the true mean about 95 times in a hundred", () => {
    let covered = 0;

    for (let trial = 0; trial < 100; trial += 1) {
      const interval = bootstrapMeanInterval(
        normalSamples(30, 100, 15, trial + 1),
        // Fewer resamples so a hundred trials stay quick; the interval moves
        // by well under a point at this size.
        { resamples: 400, seed: trial + 1 },
      )!;

      if (interval.low <= 100 && interval.high >= 100) {
        covered += 1;
      }
    }

    // Binomial noise at n=100 is about ±4 points, so this is a real check
    // without being flaky.
    expect(covered).toBeGreaterThanOrEqual(88);
    expect(covered).toBeLessThanOrEqual(100);
  });

  it("gives no interval for a single run, because one number has no spread", () => {
    expect(bootstrapMeanInterval([42])).toBeNull();
    expect(bootstrapMeanInterval([])).toBeNull();
    expect(bootstrapMeanInterval([41, 43])).not.toBeNull();
  });

  it("brackets the mean and repeats exactly", () => {
    const samples = [8, 11, 9, 14, 10, 12];
    const interval = bootstrapMeanInterval(samples)!;
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;

    expect(interval.low).toBeLessThanOrEqual(mean);
    expect(interval.high).toBeGreaterThanOrEqual(mean);
    expect(bootstrapMeanInterval(samples)).toEqual(interval);
  });

  it("narrows as runs are added", () => {
    const width = (count: number) => {
      const interval = bootstrapMeanInterval(normalSamples(count, 50, 10, 7))!;
      return interval.high - interval.low;
    };

    expect(width(80)).toBeLessThan(width(10));
  });

  it("carries the interval and the run count into the sweep summary", () => {
    const distribution = summarizeMonteCarloDistribution([
      runResult("a", 10),
      runResult("a", 12),
      runResult("a", 11),
      runResult("b", 20),
    ]);

    expect(distribution.a.runs).toBe(3);
    expect(distribution.a.ci95).not.toBeNull();
    // One run of variant b: a number, and honestly no interval.
    expect(distribution.b.runs).toBe(1);
    expect(distribution.b.ci95).toBeNull();
  });
});

function runResult(variantId: string, throughputPerMinute: number) {
  return {
    benchmark: {
      exitedCount: 0,
      throughputPerMinute,
    },
    variantId,
  } as unknown as Parameters<typeof summarizeMonteCarloDistribution>[0][number];
}
