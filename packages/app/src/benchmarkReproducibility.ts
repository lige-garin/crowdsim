// HONESTY NOTE (see docs/CLAIMS_LEDGER.md): this hash is a SAME-BUILD determinism
// check only -- an FNV of deterministic JS output that is stable across repeated
// runs of the same build/seed. It is browser-independent and CANNOT detect
// cross-browser divergence. The fabricated "Chrome/Edge/Safari reproducibility
// matrix" (label array + identical in-process runs) was removed in P0 T2; a real
// Playwright Chromium/WebKit matrix is deferred to SP-5.
import type { BenchmarkRunResult } from "./benchmarkTypes";

export type BenchmarkReproducibilityContract = {
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

export type ReproducibilityMismatch = {
  baselineHash: string;
  candidateHash: string | null;
  scenarioId: string;
};

export type ReproducibilityComparisonResult = {
  match: boolean;
  mismatches: ReproducibilityMismatch[];
};

export function compareReproducibilityContracts(
  baseline: BenchmarkReproducibilityContract,
  candidate: BenchmarkReproducibilityContract,
): ReproducibilityComparisonResult {
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
