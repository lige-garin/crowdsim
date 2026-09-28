import type { EChartsOption } from "./echartsCore";
import type { MinuteFlow } from "../analytics/runAnalytics";

const colours = { backward: "#f2a93b", forward: "#2fd0ff", peak: "#ff6b5d" };

/**
 * One count line's minute-by-minute flow as a mirrored bar chart: forward
 * above the zero line, backward below it (ECharts stacks positive and
 * negative values on opposite sides automatically), the busiest minute
 * picked out in a third colour. Pure data-to-option mapping, kept separate
 * from `CountLineFlowChart.tsx` so it can be unit-tested without a canvas.
 */
export function buildCountLineFlowOption(
  flows: readonly MinuteFlow[],
  language: "en" | "zh",
): EChartsOption {
  const sorted = [...flows].sort((a, b) => a.minuteStartSeconds - b.minuteStartSeconds);
  const peakIndex =
    sorted.length === 0
      ? -1
      : sorted.reduce(
          (best, flow, index) =>
            flow.forward + flow.backward > sorted[best].forward + sorted[best].backward
              ? index
              : best,
          0,
        );
  const forwardLabel = language === "zh" ? "→ 正向" : "→ forward";
  const backwardLabel = language === "zh" ? "← 反向" : "← backward";

  return {
    grid: { bottom: 20, left: 32, right: 8, top: 8 },
    series: [
      {
        data: sorted.map((flow, index) => ({
          itemStyle: { color: index === peakIndex ? colours.peak : colours.forward },
          value: flow.forward,
        })),
        name: forwardLabel,
        stack: "flow",
        type: "bar",
      },
      {
        data: sorted.map((flow, index) => ({
          itemStyle: { color: index === peakIndex ? colours.peak : colours.backward },
          value: -flow.backward,
        })),
        name: backwardLabel,
        stack: "flow",
        type: "bar",
      },
    ],
    tooltip: { trigger: "axis" },
    xAxis: {
      axisLabel: { fontSize: 10 },
      data: sorted.map((flow) => Math.round(flow.minuteStartSeconds / 60)),
      type: "category",
    },
    yAxis: { axisLabel: { fontSize: 10 }, type: "value" },
  };
}
