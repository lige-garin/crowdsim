import { describe, expect, it } from "vitest";
import { nearestSegmentHeadingRadians } from "./sceneEditorGeometry";

describe("nearestSegmentHeadingRadians", () => {
  it("reads the heading of the polyline's own single segment, regardless of distance from it", () => {
    const eastWest = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];

    expect(nearestSegmentHeadingRadians({ x: 50, y: 5 }, eastWest)).toBeCloseTo(0);
    // Far from the segment — still the only one there is to be near.
    expect(nearestSegmentHeadingRadians({ x: 50, y: 500 }, eastWest)).toBeCloseTo(0);
  });

  it("picks the nearest of several segments, not the first or the longest", () => {
    // An L-shaped polyline: a short eastbound leg, then a long northbound one.
    const bent = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 200 },
    ];

    // Closest to the short eastbound leg.
    expect(nearestSegmentHeadingRadians({ x: 5, y: 1 }, bent)).toBeCloseTo(0);
    // Closest to the long northbound leg.
    expect(nearestSegmentHeadingRadians({ x: 11, y: 100 }, bent)).toBeCloseTo(
      Math.PI / 2,
    );
  });

  it("is 0 for a polyline with fewer than two points", () => {
    expect(nearestSegmentHeadingRadians({ x: 0, y: 0 }, [])).toBe(0);
    expect(nearestSegmentHeadingRadians({ x: 0, y: 0 }, [{ x: 5, y: 5 }])).toBe(0);
  });

  it("gives the reverse heading for a segment walked the other way", () => {
    const westbound = [
      { x: 100, y: 0 },
      { x: 0, y: 0 },
    ];

    expect(nearestSegmentHeadingRadians({ x: 50, y: 1 }, westbound)).toBeCloseTo(
      Math.PI,
    );
  });
});
