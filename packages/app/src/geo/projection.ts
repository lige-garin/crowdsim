/**
 * Geographic coordinates ↔ scene metres.
 *
 * Everything here is pure arithmetic; nothing here makes a network call.
 *
 * Two problems this module exists for, in the order they bite:
 *
 * 1. **A map coordinate is not a metre.** `geojsonImport.ts` used to copy
 *    longitude and latitude straight into `x` and `y`, so a GeoJSON import of
 *    Shenyang (≈123.4, 41.8) produced a ~123 m × 42 m scene. Degrees have to
 *    be projected onto a local plane first.
 * 2. **Two incompatible coordinate systems are in play.** AMap (GCJ-02) and
 *    OSM / Overpass (WGS-84) differ by hundreds of metres in mainland China.
 *    Mixing them shifts a site by more than a block, which for a 300 m site
 *    is a large fraction of the whole domain.
 *
 * The engine's force model is entirely in metres — a 0.23 m body radius, the
 * Weidmann density–speed curve, desired speeds in m/s — so a scene that is
 * 2.2× out of scale does not merely look wrong, it simulates wrong.
 */

export type LatLng = { lat: number; lng: number };

/** Scene-plane metres: `x` east, `y` north, relative to a chosen origin. */
export type LocalMeters = { x: number; y: number };

/** WGS-84 ellipsoid. */
const equatorialRadiusMeters = 6378137;
const flattening = 1 / 298.257223563;
const eccentricitySquared = 2 * flattening - flattening * flattening;

/** GCJ-02 uses the Krasovsky 1940 ellipsoid, not WGS-84. */
const krasovskyRadiusMeters = 6378245;
/** Krasovsky 1940: 1/f = 298.3, so e² = 2f − f². */
const krasovskyFlattening = 1 / 298.3;
const krasovskyEccentricitySquared =
  2 * krasovskyFlattening - krasovskyFlattening * krasovskyFlattening;

const degreesToRadians = Math.PI / 180;

/**
 * Where the GCJ-02 offset is applied, as a bounding box.
 *
 * This is a **heuristic rectangle, not a political boundary**: it is the box
 * the widely circulated GCJ-02 implementation uses, and it includes parts of
 * neighbouring countries and excludes nothing that is offshore. A site near
 * the box's edge is the case to check by hand.
 */
function gcj02Applies(point: LatLng): boolean {
  return (
    point.lng >= 72.004 &&
    point.lng <= 137.8347 &&
    point.lat >= 0.8293 &&
    point.lat <= 55.8271
  );
}

function transformLat(x: number, y: number): number {
  let offset =
    -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  offset += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  offset += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
  offset +=
    ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3;

  return offset;
}

function transformLng(x: number, y: number): number {
  let offset =
    300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  offset += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  offset += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
  offset +=
    ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x * Math.PI) / 30)) * 2) / 3;

  return offset;
}

/**
 * WGS-84 → GCJ-02.
 *
 * **This is the reverse-engineered offset published as the de facto
 * implementation, not an official transform.** Its accuracy is quoted at
 * tens of metres at best; it exists so a WGS-84 point and a GCJ-02 point can
 * be brought into the same frame at all, which is a strict improvement on not
 * converting. Do not present a converted coordinate as surveyed.
 */
export function wgs84ToGcj02(point: LatLng): LatLng {
  if (!gcj02Applies(point)) {
    return { ...point };
  }

  const dLat = transformLat(point.lng - 105, point.lat - 35);
  const dLng = transformLng(point.lng - 105, point.lat - 35);
  const radLat = point.lat * degreesToRadians;
  let magic = Math.sin(radLat);
  magic = 1 - krasovskyEccentricitySquared * magic * magic;
  const sqrtMagic = Math.sqrt(magic);

  return {
    lat:
      point.lat +
      (dLat * 180) /
        (((krasovskyRadiusMeters * (1 - krasovskyEccentricitySquared)) /
          (magic * sqrtMagic)) *
          Math.PI),
    lng:
      point.lng +
      (dLng * 180) / ((krasovskyRadiusMeters / sqrtMagic) * Math.cos(radLat) * Math.PI),
  };
}

/**
 * GCJ-02 → WGS-84.
 *
 * There is no closed-form inverse of the offset, so this iterates: start from
 * the GCJ point, see where it lands, correct by the residual. It converges to
 * well under a millimetre in a handful of steps at any latitude in range;
 * `iterations` is fixed rather than tolerance-driven so the result is exactly
 * reproducible.
 */
export function gcj02ToWgs84(point: LatLng, iterations = 8): LatLng {
  if (!gcj02Applies(point)) {
    return { ...point };
  }

  let guess: LatLng = { ...point };

  for (let step = 0; step < iterations; step++) {
    const forward = wgs84ToGcj02(guess);
    guess = {
      lat: guess.lat - (forward.lat - point.lat),
      lng: guess.lng - (forward.lng - point.lng),
    };
  }

  return guess;
}

/** Radii of curvature at a latitude: north–south (M) and east–west (N). */
function curvatureRadiiMeters(lat: number) {
  const sinLat = Math.sin(lat * degreesToRadians);
  const denominator = Math.sqrt(1 - eccentricitySquared * sinLat * sinLat);

  return {
    meridional: (equatorialRadiusMeters * (1 - eccentricitySquared)) / denominator ** 3,
    primeVertical: equatorialRadiusMeters / denominator,
  };
}

/**
 * A geographic point → metres east/north of `origin`, on a local tangent
 * plane.
 *
 * Accurate over the distances this project works at (a site of a few hundred
 * metres); it is a plane, so it does not stay accurate across a city. For a
 * 3 km catchment the error is metres, which is far below the accuracy of the
 * POI counts the catchment is made of.
 */
export function projectToMeters(point: LatLng, origin: LatLng): LocalMeters {
  const radii = curvatureRadiiMeters(origin.lat);

  return {
    x:
      (point.lng - origin.lng) *
      degreesToRadians *
      radii.primeVertical *
      Math.cos(origin.lat * degreesToRadians),
    y: (point.lat - origin.lat) * degreesToRadians * radii.meridional,
  };
}

/** The inverse of `projectToMeters`. */
export function unprojectToLatLng(point: LocalMeters, origin: LatLng): LatLng {
  const radii = curvatureRadiiMeters(origin.lat);

  return {
    lat: origin.lat + point.y / radii.meridional / degreesToRadians,
    lng:
      origin.lng +
      point.x /
        radii.primeVertical /
        Math.cos(origin.lat * degreesToRadians) /
        degreesToRadians,
  };
}

/** Great-circle distance, metres. Independent of any origin. */
export function metersBetween(from: LatLng, to: LatLng): number {
  const meanRadiusMeters = 6371008.8;
  const dLat = (to.lat - from.lat) * degreesToRadians;
  const dLng = (to.lng - from.lng) * degreesToRadians;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(from.lat * degreesToRadians) *
      Math.cos(to.lat * degreesToRadians) *
      Math.sin(dLng / 2) ** 2;

  return 2 * meanRadiusMeters * Math.asin(Math.min(1, Math.sqrt(a)));
}
