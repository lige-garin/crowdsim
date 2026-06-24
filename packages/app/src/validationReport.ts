import {
  createFundamentalDiagramPoints,
  type FundamentalDiagramPoint,
} from "./fundamentalDiagram";
import type { CrowdSimScene } from "@crowdsim/scene-schema";
import {
  createCommercialValidationBundle,
  renderCommercialValidationHtml,
  type CommercialValidationBundle,
} from "./commercialValidation";
import { createPedestrianPresetSummary, pedestrianPresets } from "./pedestrianPresets";
import { rimeaCoreScenarios } from "./benchmarkScenarios";
import { runBenchmarkSuite } from "./benchmarkRunner";
import type { BenchmarkRunResult, BenchmarkScenario } from "./benchmarkTypes";
import {
  createNeuralCorrectionValidationReport,
  type NeuralCorrectionValidationReport,
} from "./socialForceCalibration";
import {
  demoTrajectoryCsv,
  deriveTrajectoryCalibrationTarget,
  parseTrajectoryDatasetCsv,
} from "./trajectoryDataset";

export type ValidationReportLanguage = "en" | "zh";

export type ValidationReport = {
  benchmarkResults: BenchmarkRunResult[];
  benchmarkSummary: {
    failCount: number;
    passCount: number;
    totalCount: number;
  };
  generatedAtIso: string;
  commercialValidation?: CommercialValidationBundle;
  neuralCorrectionValidation: NeuralCorrectionValidationReport;
  notes: string[];
  pedestrianPresetSummaries: ReturnType<typeof createPedestrianPresetSummary>[];
  referenceLinks: {
    label: string;
    url: string;
  }[];
  speedDensityPoints: FundamentalDiagramPoint[];
  title: string;
};

export type ValidationReportOptions = {
  commercialScene?: CrowdSimScene;
  generatedAtIso?: string;
  scenarios?: readonly BenchmarkScenario[];
};

const weidmannReference = {
  label: "Weidmann 1993 pedestrian speed-density reference curve",
  url: "https://doi.org/10.3929/ethz-a-000687810",
};

export function createValidationReport(
  options: ValidationReportOptions = {},
): ValidationReport {
  const generatedAtIso = options.generatedAtIso ?? new Date().toISOString();
  const benchmarkResults = runBenchmarkSuite(options.scenarios ?? rimeaCoreScenarios);
  const passCount = benchmarkResults.filter((result) => result.pass).length;
  const failCount = benchmarkResults.length - passCount;

  return {
    benchmarkResults,
    benchmarkSummary: {
      failCount,
      passCount,
      totalCount: benchmarkResults.length,
    },
    generatedAtIso,
    commercialValidation: options.commercialScene
      ? createCommercialValidationBundle(options.commercialScene)
      : undefined,
    neuralCorrectionValidation: createReportNeuralCorrectionValidation(
      benchmarkResults[0],
    ),
    notes: [
      "Current M5 fixtures are deterministic regression baselines for the browser engine.",
      "Wall-aware routing and empirical calibration should be tightened before these results are treated as certified RiMEA validation.",
    ],
    pedestrianPresetSummaries: pedestrianPresets.map(createPedestrianPresetSummary),
    referenceLinks: [
      weidmannReference,
      {
        label: pedestrianPresets[0].source.label,
        url: pedestrianPresets[0].source.url,
      },
    ],
    speedDensityPoints: createFundamentalDiagramPoints(
      benchmarkResults.map((result) => ({
        densityPeoplePerSquareMeter: result.densityPeak,
        observedSpeedMetersPerSecond: result.meanSpeedMetersPerSecond,
      })),
    ),
    title: "CrowdSim V2 calibration report",
  };
}

export function renderValidationReportHtml(
  report: ValidationReport,
  language: ValidationReportLanguage,
) {
  const labels =
    language === "zh"
      ? {
          benchmark: "基准场景",
          density: "峰值密度",
          generated: "生成时间",
          notes: "说明",
          neural: "神经修正验证",
          pass: "通过",
          presets: "人群参数",
          references: "参考来源",
          speed: "平均速度",
          speedDensity: "密度-速度对比",
          status: "状态",
          throughput: "吞吐量",
          title: "CrowdSim V2 校准报告",
        }
      : {
          benchmark: "Benchmark scenarios",
          density: "Peak density",
          generated: "Generated",
          notes: "Notes",
          neural: "Neural correction validation",
          pass: "Pass",
          presets: "Pedestrian presets",
          references: "References",
          speed: "Mean speed",
          speedDensity: "Density-speed comparison",
          status: "Status",
          throughput: "Throughput",
          title: report.title,
        };

  return `<!doctype html>
<html lang="${language === "zh" ? "zh-CN" : "en"}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(labels.title)}</title>
  <style>
    body { color: #151515; font: 14px/1.5 Arial, sans-serif; margin: 32px; }
    h1 { font-size: 28px; margin: 0 0 4px; }
    h2 { border-bottom: 1px solid #d8d8d8; font-size: 18px; margin-top: 28px; padding-bottom: 6px; }
    table { border-collapse: collapse; margin-top: 10px; width: 100%; }
    th, td { border-bottom: 1px solid #e5e5e5; padding: 8px 6px; text-align: left; }
    th { background: #f5f5f2; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; }
    .summary { display: flex; gap: 18px; margin: 18px 0; }
    .summary strong { display: block; font-size: 24px; }
    .ok { color: #11613a; font-weight: 700; }
    .fail { color: #9f1d1d; font-weight: 700; }
    @media print { body { margin: 18mm; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(labels.title)}</h1>
  <p>${escapeHtml(labels.generated)}: ${escapeHtml(report.generatedAtIso)}</p>
  <div class="summary">
    <span><strong>${report.benchmarkSummary.passCount}</strong>${escapeHtml(labels.pass)}</span>
    <span><strong>${report.benchmarkSummary.totalCount}</strong>Total</span>
    <span><strong>${report.benchmarkSummary.failCount}</strong>Fail</span>
  </div>
  <h2>${escapeHtml(labels.benchmark)}</h2>
  <table>
    <thead>
      <tr>
        <th>${escapeHtml(labels.status)}</th>
        <th>Scenario</th>
        <th>${escapeHtml(labels.density)}</th>
        <th>${escapeHtml(labels.speed)}</th>
        <th>${escapeHtml(labels.throughput)}</th>
        <th>Hash</th>
      </tr>
    </thead>
    <tbody>
      ${report.benchmarkResults
        .map(
          (result) => `<tr>
        <td class="${result.pass ? "ok" : "fail"}">${result.pass ? "PASS" : "FAIL"}</td>
        <td>${escapeHtml(result.scenarioName)}</td>
        <td>${result.densityPeak.toFixed(4)}</td>
        <td>${result.meanSpeedMetersPerSecond.toFixed(3)} m/s</td>
        <td>${result.throughputPerMinute.toFixed(2)} / min</td>
        <td>${escapeHtml(result.reproducibilityHash)}</td>
      </tr>`,
        )
        .join("")}
    </tbody>
  </table>
  <h2>${escapeHtml(labels.speedDensity)}</h2>
  <table>
    <thead>
      <tr>
        <th>${escapeHtml(labels.density)}</th>
        <th>${escapeHtml(labels.speed)}</th>
        <th>Weidmann</th>
        <th>Delta</th>
      </tr>
    </thead>
    <tbody>
      ${report.speedDensityPoints
        .map(
          (point) => `<tr>
        <td>${point.densityPeoplePerSquareMeter.toFixed(4)}</td>
        <td>${point.observedSpeedMetersPerSecond.toFixed(4)}</td>
        <td>${point.referenceSpeedMetersPerSecond.toFixed(4)}</td>
        <td>${point.speedDeltaMetersPerSecond.toFixed(4)}</td>
      </tr>`,
        )
        .join("")}
    </tbody>
  </table>
  <h2>${escapeHtml(labels.neural)}</h2>
  <table>
    <thead>
      <tr>
        <th>Target speed</th>
        <th>Target throughput</th>
        <th>Pure physics error</th>
        <th>Physics + residual error</th>
        <th>Improvement</th>
        <th>Model</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${report.neuralCorrectionValidation.targetMeanSpeedMetersPerSecond.toFixed(3)} m/s</td>
        <td>${report.neuralCorrectionValidation.targetThroughputPerMinute.toFixed(2)} / min</td>
        <td>${report.neuralCorrectionValidation.baselineMeanError.toFixed(4)}</td>
        <td>${report.neuralCorrectionValidation.correctedMeanError.toFixed(4)}</td>
        <td>${(report.neuralCorrectionValidation.improvementRatio * 100).toFixed(1)}%</td>
        <td>${escapeHtml(report.neuralCorrectionValidation.modelSource)}</td>
      </tr>
    </tbody>
  </table>
  <h2>${escapeHtml(labels.presets)}</h2>
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Label</th>
        <th>Flat</th>
        <th>Stair up</th>
        <th>Stair down</th>
      </tr>
    </thead>
    <tbody>
      ${report.pedestrianPresetSummaries
        .map(
          (preset) => `<tr>
        <td>${escapeHtml(preset.id)}</td>
        <td>${escapeHtml(preset.label)}</td>
        <td>${preset.flatTerrainMeanMetersPerSecond.toFixed(3)}</td>
        <td>${preset.stairUpMeanMetersPerSecond.toFixed(3)}</td>
        <td>${preset.stairDownMeanMetersPerSecond.toFixed(3)}</td>
      </tr>`,
        )
        .join("")}
    </tbody>
  </table>
  ${report.commercialValidation ? renderCommercialValidationHtml(report.commercialValidation) : ""}
  <h2>${escapeHtml(labels.notes)}</h2>
  <ul>${report.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
  <h2>${escapeHtml(labels.references)}</h2>
  <ul>${report.referenceLinks
    .map(
      (link) =>
        `<li><a href="${escapeAttribute(link.url)}">${escapeHtml(link.label)}</a></li>`,
    )
    .join("")}</ul>
</body>
</html>`;
}

function createReportNeuralCorrectionValidation(result: BenchmarkRunResult) {
  const dataset = parseTrajectoryDatasetCsv(demoTrajectoryCsv, {
    id: "report-bottleneck",
    name: "Report bottleneck trajectory",
    source: "unified-csv-adapter",
  });
  const target = deriveTrajectoryCalibrationTarget(dataset);

  return createNeuralCorrectionValidationReport(result, target);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
