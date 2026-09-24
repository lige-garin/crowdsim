import type { EChartsOption } from "./echartsCore";
import type { SobolSummary } from "./sobolAnalysis";

const barColour = "#2fd0ff";

/**
 * First-order Sobol index per parameter as a horizontal bar, busiest first.
 * Unlike `sensitivityTornado.ts`'s Morris equivalent, `SobolSummary[]`
 * arrives in parameter order, not pre-ranked (`sobolIndicesFromOutputs`
 * does not sort) — so this builder sorts by `firstOrder` itself rather than
 * trusting input order the way the Morris tornado does. Pure data-to-option
 * mapping, kept separate from `SobolTornadoChart.tsx` so it can be
 * unit-tested without a canvas.
 */
export function buildSobolTornadoOption(
  summary: readonly SobolSummary[],
): EChartsOption {
  const ranked = [...summary].sort((a, b) => b.firstOrder - a.firstOrder);
  return {
    grid: { bottom: 8, left: 8, right: 16, top: 8 },
    series: [
      {
        data: ranked.map((entry) => Number(entry.firstOrder.toFixed(3))),
        itemStyle: { color: barColour },
        type: "bar",
      },
    ],
    tooltip: { trigger: "axis" },
    xAxis: { axisLabel: { fontSize: 10 }, name: "Sᵢ", type: "value" },
    yAxis: {
      axisLabel: { fontSize: 10, overflow: "truncate", width: 110 },
      data: ranked.map((entry) => entry.parameterId),
      inverse: true,
      type: "category",
    },
  };
}
