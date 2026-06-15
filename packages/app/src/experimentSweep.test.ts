import { describe, expect, it } from "vitest";
import { rimeaCoreScenarios } from "./benchmarkScenarios";
import { runExperiment } from "./experimentRunner";
import {
  createExperimentFromSweep,
  summarizeMonteCarloDistribution,
} from "./experimentSweep";

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
