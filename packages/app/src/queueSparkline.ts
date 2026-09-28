/**
 * A minimal line-sparkline for one place's occupancy-over-time series
 * (`runAnalytics.ts`'s `placeOccupancyOverTime`) -- small enough to sit
 * inline next to a text row in a list, not a full axis-and-legend chart.
 */
export type QueueLengthSparklineGeometry = {
  viewBoxWidth: number;
  viewBoxHeight: number;
  /** SVG `points` for a `<polyline>`, empty string if there is nothing to draw. */
  points: string;
  /** Highest count reached in the series (0 if the series is empty), for a caller
   * that wants to label the peak next to the sparkline. */
  peak: number;
};

const viewBoxWidth = 100;
const viewBoxHeight = 24;
const verticalPadding = 2;

/**
 * Pure geometry, no DOM -- `series` is exactly what `placeOccupancyOverTime`
 * returns, already sorted by `t` (the order `occupancySeries` was recorded
 * in, never resorted). A series of length 0 or 1 draws nothing (a single
 * point has no line to draw); the caller decides what an empty sparkline
 * looks like (this project's convention is to omit the chart entirely when
 * there is nothing real to show, not draw a flat placeholder line).
 */
export function buildQueueLengthSparkline(
  series: readonly { t: number; count: number }[],
): QueueLengthSparklineGeometry {
  if (series.length < 2) {
    return { peak: series[0]?.count ?? 0, points: "", viewBoxHeight, viewBoxWidth };
  }

  const peak = Math.max(...series.map((sample) => sample.count));
  const minT = series[0].t;
  const maxT = series[series.length - 1].t;
  const tSpan = maxT - minT || 1; // a single instant of nonzero-length series: avoid /0
  const plotHeight = viewBoxHeight - verticalPadding * 2;

  const points = series
    .map((sample) => {
      const x = ((sample.t - minT) / tSpan) * viewBoxWidth;
      // peak === 0: every sample is 0, draw a flat line along the bottom
      // rather than dividing by zero.
      const y =
        viewBoxHeight -
        verticalPadding -
        (peak > 0 ? (sample.count / peak) * plotHeight : 0);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return { peak, points, viewBoxHeight, viewBoxWidth };
}
