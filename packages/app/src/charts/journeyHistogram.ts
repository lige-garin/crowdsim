import type { EChartsOption } from "./echartsCore";

const barColour = "#2fd0ff";
const p50Colour = "#f2a93b";
const p90Colour = "#ff6b5d";

/**
 * Bins raw journey durations (seconds) into a fixed number of equal-width
 * buckets spanning the observed range, with P50/P90 marked as vertical
 * lines. Pure data-to-option mapping, kept separate from
 * `JourneyTimeHistogram.tsx` so it can be unit-tested without a canvas.
 */
export function buildJourneyTimeHistogramOption(
  durations: readonly number[],
  p50Seconds: number,
  p90Seconds: number,
  language: "en" | "zh",
  binCount = 12,
): EChartsOption {
  if (durations.length === 0) {
    return {
      series: [],
      xAxis: { data: [], type: "category" },
      yAxis: { type: "value" },
    };
  }

  const max = Math.max(...durations);
  const binWidth = max > 0 ? max / binCount : 1;
  const counts = new Array<number>(binCount).fill(0);
  for (const duration of durations) {
    const index = Math.min(binCount - 1, Math.floor(duration / binWidth));
    counts[index]++;
  }
  const labels = counts.map((_, index) => Math.round((index + 1) * binWidth));

  return {
    grid: { bottom: 24, left: 32, right: 8, top: 8 },
    series: [
      {
        data: counts,
        itemStyle: { color: barColour },
        markLine: {
          // "P50"/"P90" are the metric's own names, not English words with a
          // Chinese translation -- both languages label the lines the same way.
          data: [
            {
              label: { formatter: "P50" },
              lineStyle: { color: p50Colour },
              xAxis: Math.min(binCount - 1, Math.floor(p50Seconds / binWidth)),
            },
            {
              label: { formatter: "P90" },
              lineStyle: { color: p90Colour },
              xAxis: Math.min(binCount - 1, Math.floor(p90Seconds / binWidth)),
            },
          ],
          silent: true,
          symbol: "none",
        },
        type: "bar",
      },
    ],
    tooltip: { trigger: "axis" },
    xAxis: {
      axisLabel: { fontSize: 10 },
      data: labels,
      name: language === "zh" ? "秒" : "s",
      nameLocation: "end",
      type: "category",
    },
    yAxis: { axisLabel: { fontSize: 10 }, type: "value" },
  };
}
