import type { EChartsOption } from "./echartsCore";
import type { SobolSummary } from "../analytics/sobolAnalysis";

const dotColour = "#f2a93b";

/**
 * First-order against total-order Sobol index for each parameter: a point
 * near the diagonal (`totalOrder ≈ firstOrder`) means that parameter acts
 * mostly on its own; a point well above the diagonal (`totalOrder` much
 * bigger than `firstOrder`) means most of its influence only shows up
 * through interaction with the other parameters — exactly the effect the
 * Morris scatter (μ* against σ) also hints at, but this is what Sobol
 * indices are built to isolate directly. Pure data-to-option mapping, kept
 * separate
 * from `SobolScatterChart.tsx` so it can be unit-tested without a canvas.
 */
export function buildSobolScatterOption(
  summary: readonly SobolSummary[],
): EChartsOption {
  return {
    grid: { bottom: 24, left: 32, right: 16, top: 8 },
    series: [
      {
        data: summary.map((entry) => [
          Number(entry.firstOrder.toFixed(3)),
          Number(entry.totalOrder.toFixed(3)),
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
        return `${entry.parameterId}<br/>Sᵢ ${entry.firstOrder.toFixed(3)} / Sᵀᵢ ${entry.totalOrder.toFixed(3)}`;
      },
    },
    xAxis: { axisLabel: { fontSize: 10 }, name: "Sᵢ", type: "value" },
    yAxis: { axisLabel: { fontSize: 10 }, name: "Sᵀᵢ", type: "value" },
  };
}
