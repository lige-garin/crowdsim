import { EChart } from "./EChart";
import { buildScenarioDiffPairedBarOption } from "./scenarioDiffPairedBar";
import type { MetricComparison } from "../analytics/scenarioDiffReport";

/** ▲▼ red/green: the same semantics `scenarioDiffReport.ts`'s own printable
 * HTML report already uses -- "improved" means this direction was the
 * better one for this specific metric, not that the number went up. At
 * delta === 0 the report shows neither arrow nor colour (nothing changed,
 * so "better"/"worse" doesn't apply); matched here rather than defaulting
 * to ▲/worse the way an unconditional true/false split would. */
function DeltaBadge({ metric }: { metric: MetricComparison }) {
  const percent =
    metric.deltaPercent === null ? null : Math.round(metric.deltaPercent * 10) / 10;

  if (metric.delta === 0) {
    return (
      <span className="scenario-diff-delta">
        {"–"} 0 {metric.unit}
      </span>
    );
  }

  const improved =
    (metric.direction === "lowerIsBetter" && metric.delta < 0) ||
    (metric.direction === "higherIsBetter" && metric.delta > 0);

  return (
    <span
      className={`scenario-diff-delta ${improved ? "scenario-diff-better" : "scenario-diff-worse"}`}
    >
      {improved ? "▼" : "▲"} {metric.delta > 0 ? "+" : ""}
      {Math.round(metric.delta * 100) / 100} {metric.unit}
      {percent === null ? "" : ` (${percent > 0 ? "+" : ""}${percent}%)`}
    </span>
  );
}

export function ScenarioDiffMetricChart({
  metric,
  scenarioAName,
  scenarioBName,
}: {
  metric: MetricComparison;
  scenarioAName: string;
  scenarioBName: string;
}) {
  return (
    <div
      className="scenario-diff-metric"
      data-testid={`scenario-diff-metric-${metric.key}`}
    >
      <div className="scenario-diff-metric-head">
        <span>{metric.label}</span>
        <DeltaBadge metric={metric} />
      </div>
      <EChart
        ariaLabel={metric.label}
        height={64}
        option={buildScenarioDiffPairedBarOption(metric, scenarioAName, scenarioBName)}
      />
    </div>
  );
}
