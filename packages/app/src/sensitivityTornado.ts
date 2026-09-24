import type { EChartsOption } from "./echartsCore";
import type { MorrisSummary } from "./sensitivityAnalysis";

const barColour = "#2fd0ff";

/**
 * μ* per parameter as a horizontal bar ("tornado chart"): Morris's own
 * ranking statistic, one bar per parameter, busiest first. Pure
 * data-to-option mapping, kept separate from `SensitivityTornadoChart.tsx` so it
 * can be unit-tested without a canvas.
 */
export function buildSensitivityTornadoOption(
  summary: readonly MorrisSummary[],
): EChartsOption {
  return {
    grid: { bottom: 8, left: 8, right: 16, top: 8 },
    series: [
      {
        data: summary.map((entry) => Number(entry.meanAbsoluteEffect.toFixed(3))),
        itemStyle: { color: barColour },
        type: "bar",
      },
    ],
    tooltip: { trigger: "axis" },
    xAxis: { axisLabel: { fontSize: 10 }, name: "μ*", type: "value" },
    yAxis: {
      axisLabel: { fontSize: 10, overflow: "truncate", width: 110 },
      data: summary.map((entry) => entry.parameterId),
      inverse: true,
      type: "category",
    },
  };
}
