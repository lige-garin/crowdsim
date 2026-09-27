import { describe, expect, it } from "vitest";
import { buildFruinGaugeGeometry, gaugeMaxPerSquareMeter } from "./fruinGauge";
import { fruinLevels } from "./fruinLevelOfService";

describe("buildFruinGaugeGeometry", () => {
  it("produces exactly the six A-F bands, in order, each with a real path", () => {
    const geometry = buildFruinGaugeGeometry(0.5);
    expect(geometry.segments.map((s) => s.level)).toEqual(fruinLevels);
    for (const segment of geometry.segments) {
      expect(segment.path).toMatch(/^M /);
      expect(segment.color).toMatch(/^#/);
    }
  });

  it("draws the six bands as one continuous sweep, no gaps or overlaps between them", () => {
    // The review that found this gap: the previous test only checked band
    // count/order/path-format, not that consecutive bands actually share an
    // endpoint -- an off-by-one in the shared bounds array (e.g. reading
    // boundsPerSquareMeter[index] where it should read [index + 1]) would
    // still pass every other test in this file.
    const geometry = buildFruinGaugeGeometry(0.5);
    const endpoint = (path: string) => {
      const match = path.match(
        /^M ([\d.-]+) ([\d.-]+) A [\d.]+ [\d.]+ 0 \d 1 ([\d.-]+) ([\d.-]+)$/,
      );
      if (!match) throw new Error(`unparseable arc path: ${path}`);
      return {
        start: { x: Number(match[1]), y: Number(match[2]) },
        end: { x: Number(match[3]), y: Number(match[4]) },
      };
    };
    for (let i = 0; i < geometry.segments.length - 1; i++) {
      const thisEnd = endpoint(geometry.segments[i].path).end;
      const nextStart = endpoint(geometry.segments[i + 1].path).start;
      expect(thisEnd.x).toBeCloseTo(nextStart.x, 6);
      expect(thisEnd.y).toBeCloseTo(nextStart.y, 6);
    }
    // The whole sweep spans exactly the half-ring: A starts at the left end,
    // F ends at the right end (both endpoints on the gauge's own horizontal
    // centre line, at the maximum radius).
    const first = endpoint(geometry.segments[0].path).start;
    const last = endpoint(geometry.segments[geometry.segments.length - 1].path).end;
    expect(first.x).toBeLessThan(last.x);
    expect(first.y).toBeCloseTo(last.y, 6);
  });

  it("points the needle at the left end (density 0) for zero density", () => {
    const geometry = buildFruinGaugeGeometry(0);
    // Left end of the half-ring is at the gauge's own centre-x minus radius,
    // same y as the pivot (the sweep starts flat, pointing due left).
    expect(geometry.needle.tipX).toBeLessThan(geometry.needle.pivotX);
    expect(geometry.needle.tipY).toBeCloseTo(geometry.needle.pivotY, 5);
  });

  it("points the needle at the right end for a density at or above the gauge's own max", () => {
    const atMax = buildFruinGaugeGeometry(gaugeMaxPerSquareMeter);
    const pastMax = buildFruinGaugeGeometry(gaugeMaxPerSquareMeter * 10);
    expect(atMax.needle.tipX).toBeGreaterThan(atMax.needle.pivotX);
    expect(atMax.needle.tipY).toBeCloseTo(atMax.needle.pivotY, 5);
    // Clamped: a wildly over-scale density lands at the exact same tip as
    // the gauge's own max, not further right or off the dial.
    expect(pastMax.needle.tipX).toBeCloseTo(atMax.needle.tipX, 6);
    expect(pastMax.needle.tipY).toBeCloseTo(atMax.needle.tipY, 6);
  });

  it("moves the needle monotonically rightward as density increases", () => {
    const low = buildFruinGaugeGeometry(0.2);
    const mid = buildFruinGaugeGeometry(1.0);
    const high = buildFruinGaugeGeometry(2.5);
    expect(low.needle.tipX).toBeLessThan(mid.needle.tipX);
    expect(mid.needle.tipX).toBeLessThan(high.needle.tipX);
  });

  it("clamps a negative density to the left end rather than erroring or overshooting", () => {
    const negative = buildFruinGaugeGeometry(-5);
    const zero = buildFruinGaugeGeometry(0);
    expect(negative.needle.tipX).toBeCloseTo(zero.needle.tipX, 6);
  });
});
