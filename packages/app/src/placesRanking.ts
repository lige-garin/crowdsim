import type { EChartsOption } from "./echartsCore";

const barColour = "#2fd0ff";

export type RankedPlace = {
  label: string;
  visits: number;
};

/**
 * A horizontal ranking bar of visit counts per stay/wait place (shop
 * browsing, till queue, etc.), replacing a top-8 text list with the same
 * data. Pure data-to-option mapping, kept separate from
 * `PlacesRankingChart.tsx` so it can be unit-tested without a canvas.
 */
export function buildPlacesRankingOption(
  places: readonly RankedPlace[],
): EChartsOption {
  return {
    grid: { bottom: 8, left: 8, right: 16, top: 8 },
    series: [
      {
        data: places.map((place) => place.visits),
        itemStyle: { color: barColour },
        type: "bar",
      },
    ],
    tooltip: { trigger: "axis" },
    xAxis: { axisLabel: { fontSize: 10 }, type: "value" },
    yAxis: {
      axisLabel: { fontSize: 10, overflow: "truncate", width: 110 },
      data: places.map((place) => place.label),
      // Category axes draw index 0 at the bottom by default; the busiest
      // place (index 0 of the input) should read at the top of a ranking.
      inverse: true,
      type: "category",
    },
  };
}
