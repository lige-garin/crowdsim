import type { EChartsOption } from "./echartsCore";
import type { MetricComparison } from "../analytics/scenarioDiffReport";

const colourA = "#2fd0ff";
const colourB = "#f2a93b";

/**
 * One metric, two bars: scenario A's value against scenario B's, in that
 * metric's own unit -- deliberately one chart per metric rather than one
 * chart across all of them, since journey-time seconds, LOS percentages and
 * flow counts have nothing in common on a shared axis. Colour identifies
 * which scenario a bar belongs to (A/B, consistent across every metric's
 * chart); which value is "better" is the printable report's own ▲▼
 * red/green semantics, shown alongside this chart, not re-derived here.
 * Pure data-to-option mapping, kept separate from
 * `ScenarioDiffMetricChart.tsx` so it can be unit-tested without a canvas.
 */
export function buildScenarioDiffPairedBarOption(
  metric: MetricComparison,
  scenarioAName: string,
  scenarioBName: string,
): EChartsOption {
  return {
    grid: { bottom: 8, left: 8, right: 16, top: 8 },
    series: [
      {
        data: [
          { itemStyle: { color: colourA }, value: metric.scenarioAValue },
          { itemStyle: { color: colourB }, value: metric.scenarioBValue },
        ],
        type: "bar",
      },
    ],
    tooltip: {
      trigger: "axis",
      valueFormatter: (value: number | number[]) => `${value} ${metric.unit}`,
    },
    xAxis: { axisLabel: { fontSize: 10 }, type: "value" },
    yAxis: {
      axisLabel: { fontSize: 10, overflow: "truncate", width: 60 },
      data: [scenarioAName, scenarioBName],
      inverse: true,
      type: "category",
    },
  };
}
