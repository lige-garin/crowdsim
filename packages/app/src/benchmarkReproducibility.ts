import type { BenchmarkRunResult } from "./benchmarkTypes";

export const reproducibilityBrowserMatrix = [
  { engine: "chromium", name: "Chrome" },
  { engine: "chromium", name: "Edge" },
  { engine: "webkit", name: "Safari" },
] as const;

export type ReproducibilityBrowser = (typeof reproducibilityBrowserMatrix)[number];

export const reproducibilityCiMatrix = [
  {
    channel: "chrome",
    engine: "chromium",
    id: "chrome",
    name: "Chrome",
  },
  {
    channel: "msedge",
    engine: "chromium",
    id: "edge",
    name: "Edge",
  },
  {
    channel: "webkit-safari-compat",
    engine: "webkit",
    id: "safari",
    name: "Safari",
  },
] as const;

export type ReproducibilityCiTarget = (typeof reproducibilityCiMatrix)[number];

export type BenchmarkReproducibilityContract = {
  browserMatrix: readonly ReproducibilityBrowser[];
  ciMatrix: readonly ReproducibilityCiTarget[];
  metricTolerance: {
    densityPeak: number;
    meanSpeedMetersPerSecond: number;
    throughputPerMinute: number;
  };
  hashes: Record<string, string>;
  resultCount: number;
};

export function createBenchmarkReproducibilityContract(
  results: readonly BenchmarkRunResult[],
): BenchmarkReproducibilityContract {
  return {
    browserMatrix: reproducibilityBrowserMatrix,
    ciMatrix: reproducibilityCiMatrix,
    metricTolerance: {
      densityPeak: 0.0001,
      meanSpeedMetersPerSecond: 0.0001,
      throughputPerMinute: 0.0001,
    },
    hashes: Object.fromEntries(
      results.map((result) => [result.scenarioId, result.reproducibilityHash]),
    ),
    resultCount: results.length,
  };
}

export function compareReproducibilityContracts(
  baseline: BenchmarkReproducibilityContract,
  candidate: BenchmarkReproducibilityContract,
) {
  const mismatches = Object.entries(baseline.hashes)
    .filter(([scenarioId, hash]) => candidate.hashes[scenarioId] !== hash)
    .map(([scenarioId, hash]) => ({
      baselineHash: hash,
      candidateHash: candidate.hashes[scenarioId] ?? null,
      scenarioId,
    }));

  return {
    match: mismatches.length === 0,
    mismatches,
  };
}
