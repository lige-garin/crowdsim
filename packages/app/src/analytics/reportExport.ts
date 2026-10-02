import {
  compareReproducibilityContracts,
  createBenchmarkReproducibilityContract,
  type BenchmarkReproducibilityContract,
  type ReproducibilityMismatch,
} from "./benchmarkReproducibility";
import {
  renderValidationReportHtml,
  type ValidationReport,
  type ValidationReportLanguage,
} from "./validationReport";

// A contract compared against itself always matches, so the old boolean
// `reproducibilityMatch: true` carried no information about reproducibility.
// Only a baseline captured from a different run/build can say anything, so the
// bundle now reports "nothing was compared" when the caller has no baseline.
export type ReproducibilityComparison =
  | {
      status: "not-compared";
    }
  | {
      match: boolean;
      mismatches: readonly ReproducibilityMismatch[];
      status: "compared";
    };

export type ValidationReportExportBundle = {
  filename: string;
  html: string;
  mimeType: "text/html";
  /**
   * The bundle is print-optimized HTML, not a PDF file: the supported path to
   * an actual PDF is the browser's print-to-PDF from the opened tab. The
   * button used to claim "导出 PDF" straight to an HTML blob — honest now.
   */
  printOptimized: boolean;
  reproducibility: BenchmarkReproducibilityContract;
  reproducibilityComparison: ReproducibilityComparison;
  contentDigest: string;
};

export type ValidationReportExportOptions = {
  /** Contract from an earlier run/build; without it nothing can be compared. */
  baselineReproducibility?: BenchmarkReproducibilityContract;
};

export function createValidationReportExportBundle(
  report: ValidationReport,
  language: ValidationReportLanguage,
  options: ValidationReportExportOptions = {},
): ValidationReportExportBundle {
  const html = renderValidationReportHtml(report, language);
  const reproducibility = createBenchmarkReproducibilityContract(
    report.benchmarkResults,
  );
  const digestPayload = [
    report.title,
    report.generatedAtIso,
    report.benchmarkSummary.passCount,
    report.benchmarkSummary.failCount,
    ...Object.values(reproducibility.hashes),
  ].join("|");

  return {
    filename: createReportFilename(report.generatedAtIso, language),
    html,
    mimeType: "text/html",
    printOptimized: html.includes("@media print") && html.includes("<table"),
    reproducibility,
    reproducibilityComparison: compareAgainstBaseline(
      reproducibility,
      options.baselineReproducibility,
    ),
    contentDigest: fnv1a64(digestPayload),
  };
}

function compareAgainstBaseline(
  candidate: BenchmarkReproducibilityContract,
  baseline: BenchmarkReproducibilityContract | undefined,
): ReproducibilityComparison {
  if (!baseline) {
    return { status: "not-compared" };
  }

  const comparison = compareReproducibilityContracts(baseline, candidate);

  return {
    match: comparison.match,
    mismatches: comparison.mismatches,
    status: "compared",
  };
}

export function createReportBlob(bundle: ValidationReportExportBundle) {
  return new Blob([bundle.html], { type: bundle.mimeType });
}

function createReportFilename(
  generatedAtIso: string,
  language: ValidationReportLanguage,
) {
  const date = generatedAtIso.slice(0, 10) || "undated";

  return `crowdsim-v2-calibration-${language}-${date}.html`;
}

function fnv1a64(input: string) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;

  for (let index = 0; index < input.length; index++) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }

  return hash.toString(16).padStart(16, "0");
}
