import {
  fruinColours,
  fruinDensityBreaks,
  fruinLevels,
  type FruinLevel,
} from "./fruinLevelOfService";

/**
 * Geometry for a half-ring (180°) gauge of Fruin's A–F walkway bands, with a
 * needle at the current peak density.
 *
 * The scale needs an upper bound: F itself is open-ended (`fruinLevelOfService.ts`
 * defines it as "above the last break", never a closed range), so a gauge
 * cannot show its true width -- some finite cap has to stand in for "very
 * bad and getting worse". `gaugeMaxPerSquareMeter` (3.0 P/m²) is that cap,
 * chosen, not measured: comfortably past the E/F break (~2.15 P/m²) so F's
 * band still reads as a real arc segment rather than a hairline, but not so
 * far out that A–E's already-narrow bands (A alone is 0–0.31 P/m²) get
 * crushed to invisibility. A density above the cap still needs to render
 * *somewhere*, so the needle clamps to the gauge's own max rather than
 * pointing off the dial or silently under-reporting how bad it is.
 */
export const gaugeMaxPerSquareMeter = 3.0;

export type FruinGaugeSegment = {
  level: FruinLevel;
  color: string;
  /** SVG path `d` for this band's arc, drawn as a stroke on a shared radius. */
  path: string;
};

export type FruinGaugeGeometry = {
  /** viewBox is always `0 0 ${viewBoxWidth} ${viewBoxHeight}`. */
  viewBoxWidth: number;
  viewBoxHeight: number;
  segments: readonly FruinGaugeSegment[];
  /** Needle tip, and its pivot (the gauge's own centre). */
  needle: { pivotX: number; pivotY: number; tipX: number; tipY: number };
};

const cx = 50;
const cy = 50;
const radius = 42;
const strokeWidth = 12;

/** Angle (radians, 0 = pointing left/west, increasing clockwise toward east) for a
 * density value on the half-ring, 0 at the left end (density 0) to π at the right
 * end (`gaugeMaxPerSquareMeter`). */
function angleForDensity(density: number): number {
  const clamped = Math.max(0, Math.min(gaugeMaxPerSquareMeter, density));
  return Math.PI * (clamped / gaugeMaxPerSquareMeter);
}

function pointAtAngle(angle: number, atRadius: number): { x: number; y: number } {
  // angle 0 -> left (180° on the unit circle), angle π -> right (0°) --
  // walking angle from π down to 0 as `angle` goes from 0 to π draws the
  // half-ring left-to-right along its top, the conventional gauge sweep.
  const theta = Math.PI - angle;
  return { x: cx + atRadius * Math.cos(theta), y: cy - atRadius * Math.sin(theta) };
}

function arcPath(fromAngle: number, toAngle: number): string {
  const from = pointAtAngle(fromAngle, radius);
  const to = pointAtAngle(toAngle, radius);
  const largeArc = toAngle - fromAngle > Math.PI ? 1 : 0;
  return `M ${from.x} ${from.y} A ${radius} ${radius} 0 ${largeArc} 1 ${to.x} ${to.y}`;
}

/** Pure geometry for the gauge -- no SVG/DOM, so it is directly Node-testable. */
export function buildFruinGaugeGeometry(peakDensity: number): FruinGaugeGeometry {
  const breaks = fruinDensityBreaks("walkway"); // 5 upper bounds for A..E; F has none
  const boundsPerSquareMeter: number[] = [0, ...breaks, gaugeMaxPerSquareMeter];

  const segments: FruinGaugeSegment[] = fruinLevels.map((level, index) => {
    const fromAngle = angleForDensity(boundsPerSquareMeter[index]);
    const toAngle = angleForDensity(boundsPerSquareMeter[index + 1]);
    return { level, color: fruinColours[level], path: arcPath(fromAngle, toAngle) };
  });

  const needleAngle = angleForDensity(peakDensity);
  const tip = pointAtAngle(needleAngle, radius - strokeWidth / 2 - 4);

  return {
    viewBoxWidth: 100,
    viewBoxHeight: 58,
    segments,
    needle: { pivotX: cx, pivotY: cy, tipX: tip.x, tipY: tip.y },
  };
}

export const fruinGaugeStrokeWidth = strokeWidth;
