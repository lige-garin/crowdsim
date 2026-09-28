import { buildQueueLengthSparkline } from "./queueSparkline";

/**
 * Inline "how long was this line, over time" sparkline for one queue --
 * next to (not instead of) the existing "visits · P50 · P90 · max" text
 * row for that same place, same "chart shows shape, text carries the exact
 * number" convention as this batch's other charts. Only rendered for
 * queue-kind places (`RunAnalyticsPanel.tsx` decides that, this component
 * just draws whatever series it is given).
 */
export function QueueLengthSparkline({
  series,
}: {
  series: readonly { t: number; count: number }[];
}) {
  const geometry = buildQueueLengthSparkline(series);
  if (!geometry.points) return null;

  return (
    <svg
      className="queue-length-sparkline"
      viewBox={`0 0 ${geometry.viewBoxWidth} ${geometry.viewBoxHeight}`}
      role="img"
      aria-label={`peak ${geometry.peak}`}
      preserveAspectRatio="none"
    >
      <polyline
        points={geometry.points}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      />
    </svg>
  );
}
