import type { EChartsOption } from "./echartsCore";
import type { MetricDistribution } from "../analytics/experimentSweep";

const boxColour = "#2fd0ff";

/**
 * Mean ± 95% CI per swept variant, one whisker box per variant that
 * actually has an interval. ECharts' boxplot series ([min, Q1, median, Q3,
 * max]) is repurposed here rather than a hand-rolled custom-render series:
 * min=Q1=ci95.low, max=Q3=ci95.high collapses the box to exactly the
 * interval's own span, with the mean marked as the median line inside it --
 * boxplot's own real semantics (a value with a measured spread), not
 * candlestick's misleading open/close-price framing for the same shape.
 *
 * Variants with only one run (`ci95: null`, per the project's own "no
 * interval from a single run" rule) are left out of the chart entirely
 * rather than drawn as a zero-width box, which would visually claim a
 * precision nobody measured; the panel's existing text list still lists
 * them as "n runs, no interval." Pure data-to-option mapping, kept separate
 * from `ExperimentSweepErrorBarChart.tsx` so it can be unit-tested without
 * a canvas.
 */
export function buildExperimentSweepErrorBarOption(
  distribution: Record<string, MetricDistribution>,
): EChartsOption {
  const withInterval = Object.entries(distribution).filter(
    ([, metric]) => metric.ci95 !== null,
  );

  return {
    grid: { bottom: 24, left: 8, right: 16, top: 8 },
    series: [
      {
        data: withInterval.map(([, metric]) => {
          const low = metric.ci95!.low;
          const high = metric.ci95!.high;
          return [low, low, metric.mean, high, high];
        }),
        itemStyle: { borderColor: boxColour, color: boxColour },
        type: "boxplot",
      },
    ],
    tooltip: { trigger: "item" },
    xAxis: {
      axisLabel: { fontSize: 10 },
      data: withInterval.map(([variantId]) => variantId),
      type: "category",
    },
    yAxis: { axisLabel: { fontSize: 10 }, type: "value" },
  };
}
