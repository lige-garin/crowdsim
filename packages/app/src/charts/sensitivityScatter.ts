import type { EChartsOption } from "./echartsCore";
import type { MorrisSummary } from "../analytics/sensitivityAnalysis";

const dotColour = "#f2a93b";

/**
 * μ* against σ for each parameter: high μ* with low σ means a strong,
 * consistent effect; high σ relative to μ* means the effect is nonlinear or
 * depends on the other parameters (Morris's own reading of the two
 * statistics together -- see `sensitivityAnalysis.ts`'s doc comment). Pure
 * data-to-option mapping, kept separate from `SensitivityScatterChart.tsx` so it
 * can be unit-tested without a canvas.
 */
export function buildSensitivityScatterOption(
  summary: readonly MorrisSummary[],
): EChartsOption {
  return {
    grid: { bottom: 24, left: 32, right: 16, top: 8 },
    series: [
      {
        data: summary.map((entry) => [
          Number(entry.meanAbsoluteEffect.toFixed(3)),
          Number(entry.stdDevEffect.toFixed(3)),
        ]),
        itemStyle: { color: dotColour },
        symbolSize: 10,
        type: "scatter",
      },
    ],
    tooltip: {
      formatter: (params: unknown) => {
        const point = params as { dataIndex: number };
        const entry = summary[point.dataIndex];
        return `${entry.parameterId}<br/>μ* ${entry.meanAbsoluteEffect.toFixed(3)} / σ ${entry.stdDevEffect.toFixed(3)}`;
      },
    },
    xAxis: { axisLabel: { fontSize: 10 }, name: "μ*", type: "value" },
    yAxis: { axisLabel: { fontSize: 10 }, name: "σ", type: "value" },
  };
}
