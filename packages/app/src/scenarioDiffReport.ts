import { escapeHtml } from "./htmlEscape";
import type { RunAnalyticsSummary } from "./runAnalytics";

/**
 * A difference report between two genuinely independent scenario runs —
 * gap-closure plan batch 5.4 ("情景对比报告"), the plan's own wording: "方案
 * A vs B 的差异报告". Not the same thing as the pre-existing
 * `scenarioComparison.ts`/`ScenarioComparisonPanel.tsx` ("M6... side-by-side
 * scenario comparison"), which — checked directly before writing this —
 * only ranks parameter *variants of one hardcoded fixture scene*
 * (`ExperimentDefinition.variants`, all sharing one base `scenario`) by a
 * single derived metric (throughput delta %). It has no concept of two
 * independently authored scenes, and never touches the metrics a client
 * report actually needs (evacuation time, level of service, journey times,
 * per-line flow). This module is the real thing that claim's wording
 * implied but the code behind it did not deliver.
 *
 * Deliberately standalone, the same shape this session's other stage-1
 * modules took (vehicles, checkpoint queues, IFC import): a real, tested
 * comparison-and-report primitive, NOT an orchestrator that runs two
 * simulations itself. It takes two already-computed run results — however
 * the caller produced them (the live app, a headless experiment worker run,
 * or a saved snapshot) — and only does the diffing and report rendering.
 * Actually running scenario A and scenario B side by side in the live app
 * (a second simulation engine instance, a UI for picking or importing the
 * two runs to compare) is not attempted here and would need its own design
 * pass, the same way `vehicleSimulation.ts` names engine/worker wiring as
 * separate, later work in ADR-0016.
 *
 * Scope, disclosed rather than discovered by a reader: only the metrics
 * that mean the same thing across two differently-designed scenes are
 * compared — level of service, journey times, evacuation clearance, and
 * count-line flow matched by *name* (line ids differ between scenes, names
 * are what a scene author actually chose to label a doorway or corridor).
 * Per-store dwell/queue metrics are not compared: two independently
 * designed scenarios have no reason to share store identities, so there is
 * no meaningful way to line up "shop A's queue" against "shop B's queue"
 * without a naming convention this project does not impose.
 */

export type ScenarioRunSnapshot = {
  id: string;
  name: string;
  summary: RunAnalyticsSummary;
  /** Seconds from alarm to last person out, only present for a run that
   * included an evacuation. Absent on either side: clearance is left out
   * of the comparison rather than compared against a value that doesn't
   * exist. */
  evacuationClearSeconds?: number;
};

export type MetricDirection = "lowerIsBetter" | "higherIsBetter";

export type MetricComparison = {
  key: string;
  label: string;
  unit: string;
  scenarioAValue: number;
  scenarioBValue: number;
  delta: number;
  /** `null` when scenarioAValue is 0 (a percentage change is not meaningful
   * against a zero baseline). */
  deltaPercent: number | null;
  direction: MetricDirection;
};

export type FlowLineComparison =
  | {
      name: string;
      status: "matched";
      scenarioATotal: number;
      scenarioBTotal: number;
      scenarioAPeakPerMinute: number;
      scenarioBPeakPerMinute: number;
    }
  | { name: string; status: "onlyInA"; scenarioATotal: number }
  | { name: string; status: "onlyInB"; scenarioBTotal: number };

export type ScenarioDiffReport = {
  scenarioA: { id: string; name: string };
  scenarioB: { id: string; name: string };
  generatedAtIso: string;
  metrics: readonly MetricComparison[];
  flows: readonly FlowLineComparison[];
};

function metric(
  key: string,
  label: string,
  unit: string,
  aValue: number,
  bValue: number,
  direction: MetricDirection,
): MetricComparison {
  const delta = bValue - aValue;
  return {
    delta,
    deltaPercent: aValue !== 0 ? (delta / aValue) * 100 : null,
    direction,
    key,
    label,
    scenarioAValue: aValue,
    scenarioBValue: bValue,
    unit,
  };
}

export function buildScenarioDiffReport(
  scenarioA: ScenarioRunSnapshot,
  scenarioB: ScenarioRunSnapshot,
): ScenarioDiffReport {
  const a = scenarioA.summary;
  const b = scenarioB.summary;

  const metrics: MetricComparison[] = [
    metric(
      "peakDensity",
      "Peak density",
      "P/m²",
      a.levelOfService.peakDensity,
      b.levelOfService.peakDensity,
      "lowerIsBetter",
    ),
    metric(
      "shareDOrWorse",
      "Share at D or worse",
      "%",
      a.levelOfService.shareDOrWorse * 100,
      b.levelOfService.shareDOrWorse * 100,
      "lowerIsBetter",
    ),
    metric(
      "journeyP50",
      "Journey time P50",
      "s",
      a.journeys.p50Seconds,
      b.journeys.p50Seconds,
      "lowerIsBetter",
    ),
    metric(
      "journeyP90",
      "Journey time P90",
      "s",
      a.journeys.p90Seconds,
      b.journeys.p90Seconds,
      "lowerIsBetter",
    ),
    metric(
      "journeyMean",
      "Journey time mean",
      "s",
      a.journeys.meanSeconds,
      b.journeys.meanSeconds,
      "lowerIsBetter",
    ),
  ];

  if (
    scenarioA.evacuationClearSeconds !== undefined &&
    scenarioB.evacuationClearSeconds !== undefined
  ) {
    metrics.push(
      metric(
        "evacuationClearSeconds",
        "Evacuation clear time",
        "s",
        scenarioA.evacuationClearSeconds,
        scenarioB.evacuationClearSeconds,
        "lowerIsBetter",
      ),
    );
  }

  return {
    flows: compareFlows(a.flows, b.flows),
    generatedAtIso: new Date().toISOString(),
    metrics,
    scenarioA: { id: scenarioA.id, name: scenarioA.name },
    scenarioB: { id: scenarioB.id, name: scenarioB.name },
  };
}

function compareFlows(
  aFlows: RunAnalyticsSummary["flows"],
  bFlows: RunAnalyticsSummary["flows"],
): FlowLineComparison[] {
  const bByName = new Map(bFlows.map((flow) => [flow.name, flow]));
  const seen = new Set<string>();
  const rows: FlowLineComparison[] = [];

  for (const aFlow of aFlows) {
    seen.add(aFlow.name);
    const bFlow = bByName.get(aFlow.name);
    if (bFlow) {
      rows.push({
        name: aFlow.name,
        scenarioAPeakPerMinute: aFlow.peakPerMinute,
        scenarioATotal: aFlow.forward + aFlow.backward,
        scenarioBPeakPerMinute: bFlow.peakPerMinute,
        scenarioBTotal: bFlow.forward + bFlow.backward,
        status: "matched",
      });
    } else {
      rows.push({
        name: aFlow.name,
        scenarioATotal: aFlow.forward + aFlow.backward,
        status: "onlyInA",
      });
    }
  }

  for (const bFlow of bFlows) {
    if (seen.has(bFlow.name)) continue;
    rows.push({
      name: bFlow.name,
      scenarioBTotal: bFlow.forward + bFlow.backward,
      status: "onlyInB",
    });
  }

  return rows;
}

export type ScenarioDiffReportLanguage = "en" | "zh";

const labels: Record<ScenarioDiffReportLanguage, Record<string, string>> = {
  en: {
    a: "Scenario A",
    b: "Scenario B",
    delta: "Delta",
    flowOnlyA: "only in A",
    flowOnlyB: "only in B",
    flows: "Count-line flow",
    generated: "Generated",
    metrics: "Metrics",
    peak: "peak/min",
    title: "Scenario comparison report",
    total: "total",
  },
  zh: {
    a: "方案 A",
    b: "方案 B",
    delta: "差值",
    flowOnlyA: "仅方案 A 有",
    flowOnlyB: "仅方案 B 有",
    flows: "计数线流量",
    generated: "生成时间",
    metrics: "指标",
    peak: "峰值/分",
    title: "情景对比报告",
    total: "合计",
  },
};

/** A printable HTML report, the same `<table>` + `@media print` pattern
 * `validationReport.ts`'s `renderValidationReportHtml` established — not
 * shared code, since the two data shapes (a single scenario's benchmark
 * results vs. a two-scenario metric diff) differ enough that forcing one
 * renderer over both would be a worse abstraction than two similar-looking
 * functions. */
export function renderScenarioDiffReportHtml(
  report: ScenarioDiffReport,
  language: ScenarioDiffReportLanguage,
): string {
  const t = labels[language];
  const directionArrow = (comparison: MetricComparison) => {
    if (comparison.delta === 0) return "";
    const improved =
      (comparison.direction === "lowerIsBetter" && comparison.delta < 0) ||
      (comparison.direction === "higherIsBetter" && comparison.delta > 0);
    return `<span class="${improved ? "better" : "worse"}">${improved ? "▼" : "▲"}</span>`;
  };

  return `<!doctype html>
<html lang="${language === "zh" ? "zh-CN" : "en"}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(t.title)}</title>
  <style>
    body { color: #151515; font: 14px/1.5 Arial, sans-serif; margin: 32px; }
    h1 { font-size: 28px; margin: 0 0 4px; }
    h2 { border-bottom: 1px solid #d8d8d8; font-size: 18px; margin-top: 28px; padding-bottom: 6px; }
    table { border-collapse: collapse; margin-top: 10px; width: 100%; }
    th, td { border-bottom: 1px solid #e5e5e5; padding: 8px 6px; text-align: left; }
    th { background: #f5f5f2; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; }
    .better { color: #11613a; font-weight: 700; }
    .worse { color: #9f1d1d; font-weight: 700; }
    @media print { body { margin: 18mm; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(t.title)}</h1>
  <p>${escapeHtml(t.a)}: ${escapeHtml(report.scenarioA.name)} &middot; ${escapeHtml(t.b)}: ${escapeHtml(report.scenarioB.name)}</p>
  <p>${escapeHtml(t.generated)}: ${escapeHtml(report.generatedAtIso)}</p>
  <h2>${escapeHtml(t.metrics)}</h2>
  <table>
    <thead>
      <tr>
        <th>${escapeHtml(t.metrics)}</th>
        <th>${escapeHtml(t.a)}</th>
        <th>${escapeHtml(t.b)}</th>
        <th>${escapeHtml(t.delta)}</th>
      </tr>
    </thead>
    <tbody>
      ${report.metrics
        .map(
          (comparison) => `<tr>
        <td>${escapeHtml(comparison.label)}</td>
        <td>${comparison.scenarioAValue.toFixed(2)} ${escapeHtml(comparison.unit)}</td>
        <td>${comparison.scenarioBValue.toFixed(2)} ${escapeHtml(comparison.unit)}</td>
        <td>${directionArrow(comparison)} ${comparison.delta >= 0 ? "+" : ""}${comparison.delta.toFixed(2)} ${escapeHtml(comparison.unit)}${
          comparison.deltaPercent === null
            ? ""
            : ` (${comparison.deltaPercent >= 0 ? "+" : ""}${comparison.deltaPercent.toFixed(1)}%)`
        }</td>
      </tr>`,
        )
        .join("")}
    </tbody>
  </table>
  <h2>${escapeHtml(t.flows)}</h2>
  <table>
    <thead>
      <tr>
        <th>${escapeHtml(t.flows)}</th>
        <th>${escapeHtml(t.a)}</th>
        <th>${escapeHtml(t.b)}</th>
      </tr>
    </thead>
    <tbody>
      ${report.flows
        .map((flow) => {
          if (flow.status === "matched") {
            return `<tr>
        <td>${escapeHtml(flow.name)}</td>
        <td>${flow.scenarioATotal} (${flow.scenarioAPeakPerMinute} ${escapeHtml(t.peak)})</td>
        <td>${flow.scenarioBTotal} (${flow.scenarioBPeakPerMinute} ${escapeHtml(t.peak)})</td>
      </tr>`;
          }
          if (flow.status === "onlyInA") {
            return `<tr>
        <td>${escapeHtml(flow.name)}</td>
        <td>${flow.scenarioATotal} ${escapeHtml(t.total)}</td>
        <td>${escapeHtml(t.flowOnlyA)}</td>
      </tr>`;
          }
          return `<tr>
        <td>${escapeHtml(flow.name)}</td>
        <td>${escapeHtml(t.flowOnlyB)}</td>
        <td>${flow.scenarioBTotal} ${escapeHtml(t.total)}</td>
      </tr>`;
        })
        .join("")}
    </tbody>
  </table>
</body>
</html>`;
}
