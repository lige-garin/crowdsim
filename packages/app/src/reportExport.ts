import {
  compareReproducibilityContracts,
  createBenchmarkReproducibilityContract,
  type BenchmarkReproducibilityContract,
} from "./benchmarkReproducibility";
import {
  renderValidationReportHtml,
  type ValidationReport,
  type ValidationReportLanguage,
} from "./validationReport";

export type ValidationReportExportBundle = {
  filename: string;
  html: string;
  mimeType: "text/html";
  pdfReady: boolean;
  reproducibility: BenchmarkReproducibilityContract;
  reproducibilityMatch: boolean;
  contentDigest: string;
};

export function createValidationReportExportBundle(
  report: ValidationReport,
  language: ValidationReportLanguage,
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
    pdfReady: html.includes("@media print") && html.includes("<table"),
    reproducibility,
    reproducibilityMatch: compareReproducibilityContracts(
      reproducibility,
      reproducibility,
    ).match,
    contentDigest: fnv1a64(digestPayload),
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
