import { describe, expect, it } from "vitest";
import { rimeaCoreScenarios } from "./benchmarkScenarios";
import {
  compareReproducibilityContracts,
  createBenchmarkReproducibilityContract,
} from "./benchmarkReproducibility";
import { runBenchmarkSuite } from "./benchmarkRunner";

describe("benchmark reproducibility contract", () => {
  it("keeps same-seed benchmark hashes stable across repeated runs (same-build only)", () => {
    const baseline = createBenchmarkReproducibilityContract(
      runBenchmarkSuite(rimeaCoreScenarios),
    );
    const candidate = createBenchmarkReproducibilityContract(
      runBenchmarkSuite(rimeaCoreScenarios),
    );

    expect(baseline.resultCount).toBe(rimeaCoreScenarios.length);
    expect(baseline.metricTolerance.meanSpeedMetersPerSecond).toBe(0.0001);
    expect(compareReproducibilityContracts(baseline, candidate)).toEqual({
      match: true,
      mismatches: [],
    });
  }, 10_000);

  it("reports scenario-level hash drift", () => {
    const baseline = createBenchmarkReproducibilityContract(
      runBenchmarkSuite(rimeaCoreScenarios),
    );
    const candidate = {
      ...baseline,
      hashes: {
        ...baseline.hashes,
        "rimea-straight-corridor": "changed",
      },
    };

    expect(compareReproducibilityContracts(baseline, candidate)).toMatchObject({
      match: false,
      mismatches: [
        {
          candidateHash: "changed",
          scenarioId: "rimea-straight-corridor",
        },
      ],
    });
  });
});
