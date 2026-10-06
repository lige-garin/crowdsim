import { describe, expect, it } from "vitest";
import {
  gcj02ToWgs84,
  metersBetween,
  projectToMeters,
  unprojectToLatLng,
  wgs84ToGcj02,
} from "./projection";

/** Shenyang, which is where this project's sites are. */
const shenyang = { lat: 41.8, lng: 123.46 };

describe("projection", () => {
  it("puts the origin at zero", () => {
    expect(projectToMeters(shenyang, shenyang)).toEqual({ x: 0, y: 0 });
  });

  it("goes east for more longitude and north for more latitude", () => {
    const east = projectToMeters(
      { lat: shenyang.lat, lng: shenyang.lng + 0.001 },
      shenyang,
    );
    const north = projectToMeters(
      { lat: shenyang.lat + 0.001, lng: shenyang.lng },
      shenyang,
    );

    expect(east.x).toBeGreaterThan(0);
    expect(east.y).toBeCloseTo(0, 6);
    expect(north.y).toBeGreaterThan(0);
    expect(north.x).toBeCloseTo(0, 6);
  });

  it("agrees with the great-circle distance over a site", () => {
    const away = { lat: shenyang.lat + 0.002, lng: shenyang.lng + 0.002 };
    const projected = projectToMeters(away, shenyang);

    expect(Math.hypot(projected.x, projected.y)).toBeCloseTo(
      metersBetween(shenyang, away),
      0,
    );
  });

  it("round-trips through the inverse", () => {
    const point = { lat: 41.8123, lng: 123.4777 };
    const back = unprojectToLatLng(projectToMeters(point, shenyang), shenyang);

    expect(back.lat).toBeCloseTo(point.lat, 9);
    expect(back.lng).toBeCloseTo(point.lng, 9);
  });
});

describe("GCJ-02", () => {
  it("shifts a mainland point by hundreds of metres", () => {
    // The whole reason this module exists: AMap and OSM points for the same
    // place are not interchangeable, and the gap is bigger than a site.
    const offset = metersBetween(shenyang, wgs84ToGcj02(shenyang));

    expect(offset).toBeGreaterThan(100);
    expect(offset).toBeLessThan(1500);
  });

  it("leaves a point outside the box alone rather than shifting it anyway", () => {
    const tokyo = { lat: 35.68, lng: 139.77 };

    expect(wgs84ToGcj02(tokyo)).toEqual(tokyo);
    expect(gcj02ToWgs84(tokyo)).toEqual(tokyo);
  });

  it("inverts its own forward transform", () => {
    const gcj = wgs84ToGcj02(shenyang);
    const back = gcj02ToWgs84(gcj);

    expect(back.lat).toBeCloseTo(shenyang.lat, 7);
    expect(back.lng).toBeCloseTo(shenyang.lng, 7);
  });

  it("round-trips a site corner to well under a metre", () => {
    const corner = { lat: 41.8021, lng: 123.4633 };
    const back = gcj02ToWgs84(wgs84ToGcj02(corner));

    expect(metersBetween(corner, back)).toBeLessThan(0.001);
  });

  it("moves north and east, which is the direction the offset runs", () => {
    // Not a law of the transform, a property of this part of China: the
    // published offset pushes GCJ-02 points north-east of the WGS-84 ones.
    const gcj = wgs84ToGcj02(shenyang);

    expect(gcj.lat).toBeGreaterThan(shenyang.lat);
    expect(gcj.lng).toBeGreaterThan(shenyang.lng);
  });
});
