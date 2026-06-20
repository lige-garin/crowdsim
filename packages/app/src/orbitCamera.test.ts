import { describe, expect, it } from "vitest";
import {
  orbitByDrag,
  zoomByWheel,
  orbitToPosition,
  positionToOrbit,
  POLAR_MIN,
  POLAR_MAX,
  RADIUS_MIN,
  RADIUS_MAX,
  type OrbitState,
} from "./orbitCamera";

const base: OrbitState = { azimuth: 0, polar: Math.PI / 4, radius: 100 };

describe("orbitByDrag", () => {
  it("rotates the azimuth horizontally and keeps the radius", () => {
    const next = orbitByDrag(base, 100, 0);
    expect(next.azimuth).not.toBe(base.azimuth);
    expect(next.radius).toBe(base.radius);
  });

  it("clamps the polar angle into the 2.5D tilt range", () => {
    const wayUp = orbitByDrag(base, 0, -100000);
    const wayDown = orbitByDrag(base, 0, 100000);
    expect(wayUp.polar).toBeLessThanOrEqual(POLAR_MAX);
    expect(wayUp.polar).toBeGreaterThanOrEqual(POLAR_MIN);
    expect(wayDown.polar).toBeLessThanOrEqual(POLAR_MAX);
    expect(wayDown.polar).toBeGreaterThanOrEqual(POLAR_MIN);
  });
});

describe("zoomByWheel", () => {
  it("scrolling down (positive deltaY) zooms out, up zooms in", () => {
    const out = zoomByWheel(base, 240);
    const inn = zoomByWheel(base, -240);
    expect(out.radius).toBeGreaterThan(base.radius);
    expect(inn.radius).toBeLessThan(base.radius);
  });

  it("clamps the radius to the allowed range", () => {
    expect(zoomByWheel(base, 1e9).radius).toBeLessThanOrEqual(RADIUS_MAX);
    expect(zoomByWheel(base, -1e9).radius).toBeGreaterThanOrEqual(RADIUS_MIN);
  });
});

describe("orbitToPosition / positionToOrbit", () => {
  it("places the camera on the ground plane when polar is horizontal", () => {
    const pos = orbitToPosition({ azimuth: 0, polar: Math.PI / 2, radius: 50 });
    expect(pos.z).toBeCloseTo(0, 6);
    expect(pos.x).toBeCloseTo(50, 6);
  });

  it("round-trips position <-> orbit", () => {
    const pos = orbitToPosition(base);
    const back = positionToOrbit(pos);
    expect(back.azimuth).toBeCloseTo(base.azimuth, 6);
    expect(back.polar).toBeCloseTo(base.polar, 6);
    expect(back.radius).toBeCloseTo(base.radius, 6);
  });

  it("offsets from a non-origin look-at target", () => {
    const target = { x: 10, y: -5, z: 2 };
    const pos = orbitToPosition({ azimuth: 0, polar: Math.PI / 2, radius: 30 }, target);
    expect(pos.z).toBeCloseTo(target.z, 6);
    expect(pos.x).toBeCloseTo(target.x + 30, 6);
  });
});
