import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rimeaCoreScenarios } from "./benchmarkScenarios";
import {
  compareReproducibilityContracts,
  createBenchmarkReproducibilityContract,
  reproducibilityCiMatrix,
  reproducibilityBrowserMatrix,
} from "./benchmarkReproducibility";
import { runBenchmarkSuite } from "./benchmarkRunner";

describe("benchmark reproducibility contract", () => {
  it("declares the browser matrix expected for CI parity", () => {
    expect(reproducibilityBrowserMatrix.map((browser) => browser.name)).toEqual([
      "Chrome",
      "Edge",
      "Safari",
    ]);
    expect(reproducibilityCiMatrix.map((browser) => browser.channel)).toEqual([
      "chrome",
      "msedge",
      "webkit-safari-compat",
    ]);
  });

  it("keeps the GitHub Actions reproducibility matrix in sync", () => {
    const workflow = readFileSync(
      join(process.cwd(), "../../.github/workflows/ci.yml"),
      "utf8",
    );

    expect(workflow).toContain("reproducibility-matrix");
    for (const browser of reproducibilityCiMatrix) {
      expect(workflow).toContain(`id: ${browser.id}`);
      expect(workflow).toContain(`name: ${browser.name}`);
      expect(workflow).toContain(`engine: ${browser.engine}`);
      expect(workflow).toContain(`channel: ${browser.channel}`);
    }
    expect(workflow).toContain(
      "pnpm --filter @crowdsim/app test -- benchmarkReproducibility",
    );
  });

  it("keeps same-seed benchmark hashes stable across repeated runs", () => {
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
  });

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
