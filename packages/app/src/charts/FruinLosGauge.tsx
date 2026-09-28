import { buildFruinGaugeGeometry, fruinGaugeStrokeWidth } from "./fruinGauge";
import type { FruinLevel } from "../analytics/fruinLevelOfService";

/**
 * A–F half-ring gauge for the run's peak density, next to (not instead of)
 * the precise "X.XX P/m² · LEVEL" text line -- this session's own running
 * convention for every chart added this batch: the picture gives the shape
 * at a glance, the text still carries the exact number.
 */
export function FruinLosGauge({
  peakDensity,
  peakLevel,
}: {
  peakDensity: number;
  peakLevel: FruinLevel;
}) {
  const geometry = buildFruinGaugeGeometry(peakDensity);

  return (
    <svg
      className="fruin-los-gauge"
      viewBox={`0 0 ${geometry.viewBoxWidth} ${geometry.viewBoxHeight}`}
      role="img"
      aria-label={`${peakDensity.toFixed(2)} P/m² · ${peakLevel}`}
    >
      {geometry.segments.map((segment) => (
        <path
          key={segment.level}
          d={segment.path}
          fill="none"
          stroke={segment.color}
          strokeWidth={fruinGaugeStrokeWidth}
        />
      ))}
      <line
        x1={geometry.needle.pivotX}
        y1={geometry.needle.pivotY}
        x2={geometry.needle.tipX}
        y2={geometry.needle.tipY}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <circle
        cx={geometry.needle.pivotX}
        cy={geometry.needle.pivotY}
        r={3}
        fill="currentColor"
      />
    </svg>
  );
}
