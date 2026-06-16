import { describe, expect, it } from "vitest";
import { rimeaCoreScenarios } from "./benchmarkScenarios";
import { runBenchmarkScenario, runBenchmarkSuite } from "./benchmarkRunner";

describe("benchmark runner", () => {
  it("runs the core RiMEA regression fixtures inside their expected ranges", () => {
    const results = runBenchmarkSuite(rimeaCoreScenarios);

    expect(results).toHaveLength(4);
    expect(results.every((result) => result.pass)).toBe(true);
    expect(results.map((result) => result.scenarioId)).toEqual(
      rimeaCoreScenarios.map((scenario) => scenario.id),
    );
  });

  it("is reproducible for a fixed scenario seed", () => {
    const firstRun = runBenchmarkScenario(rimeaCoreScenarios[0]);
    const secondRun = runBenchmarkScenario(rimeaCoreScenarios[0]);

    expect(secondRun).toMatchObject({
      densityPeak: firstRun.densityPeak,
      exitedCount: firstRun.exitedCount,
      meanSpeedMetersPerSecond: firstRun.meanSpeedMetersPerSecond,
      remainingAgents: firstRun.remainingAgents,
      reproducibilityHash: firstRun.reproducibilityHash,
      spawnedCount: firstRun.spawnedCount,
      stepCount: firstRun.stepCount,
      throughputPerMinute: firstRun.throughputPerMinute,
    });
  });

  it("binds benchmark results to the runtime profile", () => {
    const mainRun = runBenchmarkScenario(rimeaCoreScenarios[0]);
    const workerRun = runBenchmarkScenario(rimeaCoreScenarios[0], {
      runtime: {
        decisionBackend: "wasm-ready",
        sharedMemory: "sab",
        thread: "worker",
      },
    });

    expect(workerRun.runtime).toMatchObject({
      decisionBackend: "wasm-ready",
      sharedMemory: "sab",
      thread: "worker",
    });
    expect(workerRun.reproducibilityHash).not.toBe(mainRun.reproducibilityHash);
  });

  it("reports failed comparisons without hiding the measured value", () => {
    const scenario = {
      ...rimeaCoreScenarios[0],
      expectations: [
        {
          metric: "spawnedCount" as const,
          range: { min: 10_000 },
        },
      ],
    };
    const result = runBenchmarkScenario(scenario);

    expect(result.pass).toBe(false);
    expect(result.comparisons[0]).toMatchObject({
      metric: "spawnedCount",
      pass: false,
    });
    expect(result.comparisons[0].actual).toBe(result.spawnedCount);
  });
});
