import { describe, expect, it } from "vitest";
import { rimeaCoreScenarios } from "./benchmarkScenarios";
import { createExperimentFromSweep } from "./experimentSweep";
import { runExperimentQueue } from "./experimentQueue";

describe("experiment queue", () => {
  it("runs experiments serially and emits progress", async () => {
    const progress: number[] = [];
    const experiment = createExperimentFromSweep({
      id: "queue-speed-sweep",
      name: "Queue speed sweep",
      parameter: {
        end: 1.2,
        kind: "speed",
        start: 0.9,
        step: 0.3,
      },
      replications: 2,
      scenario: rimeaCoreScenarios[0],
    });
    const results = await runExperimentQueue(experiment, {
      onProgress: (item) => progress.push(item.completed / item.total),
    });

    expect(results).toHaveLength(4);
    expect(progress).toEqual([0.25, 0.5, 0.75, 1]);
  });

  it("can abort before completing the queue", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      runExperimentQueue(
        createExperimentFromSweep({
          id: "aborted",
          name: "Aborted",
          parameter: {
            end: 1.2,
            kind: "speed",
            start: 0.9,
            step: 0.3,
          },
          replications: 1,
          scenario: rimeaCoreScenarios[0],
        }),
        { signal: controller.signal },
      ),
    ).rejects.toThrow("aborted");
  });
});
