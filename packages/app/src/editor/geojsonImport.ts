import {
  parseScene,
  type CrowdSimScene,
  type ScenePoint,
} from "@crowdsim/scene-schema";
import { gcj02ToWgs84, projectToMeters, type LatLng } from "../geo/projection";

/**
 * Which coordinates the file carries.
 *
 * `"wgs84"` is the default because RFC 7946 says GeoJSON coordinates *are*
 * WGS-84 unless the file says otherwise — so reading them as metres, which is
 * what this importer did until now, was simply wrong: a Shenyang file
 * (≈123.4, 41.8) became a ~123 m × 42 m scene.
 *
 * It is a visible change for anyone who was already importing metre-based
 * GeoJSON. Those callers pass `coordinateSystem: "meters"` and get the old
 * behaviour back, deliberately and explicitly.
 */
export type GeoJsonCoordinateSystem = "wgs84" | "gcj02" | "meters";

export type GeoJsonImportOptions = {
  coordinateSystem?: GeoJsonCoordinateSystem;
  /**
   * Project onto this point instead of the data's own centroid. Useful when
   * several files have to land on the same plane.
   */
  origin?: LatLng;
};

type GeoJsonGeometry = {
  coordinates: unknown;
  type: string;
};

type GeoJsonFeature = {
  geometry?: GeoJsonGeometry | null;
  id?: number | string;
  properties?: {
    id?: number | string;
    name?: string;
  } | null;
  type: "Feature";
};

type GeoJsonFeatureCollection = {
  features: GeoJsonFeature[];
  type: "FeatureCollection";
};

export function createSceneFromGeoJson(
  baseScene: CrowdSimScene,
  input: unknown,
  options: GeoJsonImportOptions = {},
): CrowdSimScene {
  const features = collectFeatures(input);
  const raw = features.flatMap((feature, index) =>
    wallPointsFromFeature(feature).map((points, wallIndex) => ({
      id: geoJsonEntityId(feature, index, wallIndex),
      points,
    })),
  );

  const placed = placeInMetres(
    raw,
    options.coordinateSystem ?? "wgs84",
    options.origin,
  );
  const importedWalls = placed.map((wall) => ({
    id: wall.id,
    geometry: {
      type: "polyline" as const,
      points: wall.points,
    },
    thickness: 0.2,
  }));
  const reach = placed.flatMap((wall) => wall.points);

  return parseScene({
    ...baseScene,
    walls: [...baseScene.walls, ...importedWalls],
    // A projected footprint can land outside the scene it is imported into,
    // in which case it would be drawn off the world and simulated off it too.
    world: grownWorld(baseScene.world, reach),
  });
}

/**
 * Degrees → metres, then shifted so nothing sits off the world.
 *
 * A local tangent plane puts the footprint's centroid near (0, 0), so half of
 * a real site would have negative coordinates; the shift is a translation of
 * the whole import, which preserves every distance in it.
 */
function placeInMetres(
  walls: { id: string; points: ScenePoint[] }[],
  coordinateSystem: GeoJsonCoordinateSystem,
  origin?: LatLng,
) {
  if (coordinateSystem === "meters") {
    return walls;
  }

  const points = walls.flatMap((wall) => wall.points);

  for (const point of points) {
    // Refusing rather than projecting nonsense: a file that claims to be
    // geographic but is not would otherwise produce a scene that looks
    // plausible and is a thousand kilometres across.
    if (Math.abs(point.x) > 180 || Math.abs(point.y) > 90) {
      throw new Error(
        `GeoJSON coordinate (${point.x}, ${point.y}) is outside any longitude/latitude range. ` +
          `Pass { coordinateSystem: "meters" } if these are already metres.`,
      );
    }
  }

  if (points.length === 0) {
    return walls;
  }

  const projectedOrigin: LatLng = origin ?? {
    lat: points.reduce((sum, p) => sum + p.y, 0) / points.length,
    lng: points.reduce((sum, p) => sum + p.x, 0) / points.length,
  };
  const projected = walls.map((wall) => ({
    id: wall.id,
    points: wall.points.map((point) => {
      const geographic: LatLng = { lat: point.y, lng: point.x };
      const wgs84 =
        coordinateSystem === "gcj02" ? gcj02ToWgs84(geographic) : geographic;

      return projectToMeters(wgs84, projectedOrigin);
    }),
  }));

  // Projected y is metres north; the scene's own y is metres "up" on the
  // plan, which is the same direction for a north-up site plan. No flip.
  const minX = Math.min(...projected.flatMap((wall) => wall.points.map((p) => p.x)));
  const minY = Math.min(...projected.flatMap((wall) => wall.points.map((p) => p.y)));
  const margin = 5;

  return projected.map((wall) => ({
    id: wall.id,
    points: wall.points.map((point) => ({
      x: point.x - minX + margin,
      y: point.y - minY + margin,
    })),
  }));
}

function grownWorld(
  world: { width: number; height: number },
  points: readonly ScenePoint[],
) {
  let width = world.width;
  let height = world.height;

  for (const point of points) {
    width = Math.max(width, point.x + 5);
    height = Math.max(height, point.y + 5);
  }

  return { width, height };
}

function collectFeatures(input: unknown): GeoJsonFeature[] {
  if (isFeatureCollection(input)) {
    return input.features;
  }

  if (isFeature(input)) {
    return [input];
  }

  return [];
}

function wallPointsFromFeature(feature: GeoJsonFeature): ScenePoint[][] {
  const geometry = feature.geometry;

  if (!geometry) {
    return [];
  }

  if (geometry.type === "LineString") {
    const points = pointsFromCoordinates(geometry.coordinates);
    return points.length >= 2 ? [points] : [];
  }

  if (geometry.type === "Polygon") {
    return polygonRingsFromCoordinates(geometry.coordinates);
  }

  if (geometry.type === "MultiLineString") {
    return Array.isArray(geometry.coordinates)
      ? geometry.coordinates
          .map(pointsFromCoordinates)
          .filter((points) => points.length >= 2)
      : [];
  }

  return [];
}

function pointsFromCoordinates(coordinates: unknown): ScenePoint[] {
  if (!Array.isArray(coordinates)) {
    return [];
  }

  return coordinates.flatMap((coordinate) => {
    if (
      Array.isArray(coordinate) &&
      typeof coordinate[0] === "number" &&
      typeof coordinate[1] === "number"
    ) {
      return [{ x: coordinate[0], y: coordinate[1] }];
    }

    return [];
  });
}

function polygonRingsFromCoordinates(coordinates: unknown): ScenePoint[][] {
  if (!Array.isArray(coordinates)) {
    return [];
  }

  return coordinates.map(pointsFromCoordinates).filter((points) => points.length >= 3);
}

function geoJsonEntityId(
  feature: GeoJsonFeature,
  index: number,
  wallIndex: number,
): string {
  const rawId = feature.properties?.id ?? feature.id ?? `geojson-${index + 1}`;
  const safeId = String(rawId).replace(/[^a-zA-Z0-9_-]/g, "-");

  return wallIndex === 0 ? safeId : `${safeId}-${wallIndex + 1}`;
}

function isFeatureCollection(input: unknown): input is GeoJsonFeatureCollection {
  return (
    typeof input === "object" &&
    input !== null &&
    (input as GeoJsonFeatureCollection).type === "FeatureCollection" &&
    Array.isArray((input as GeoJsonFeatureCollection).features)
  );
}

function isFeature(input: unknown): input is GeoJsonFeature {
  return (
    typeof input === "object" &&
    input !== null &&
    (input as GeoJsonFeature).type === "Feature"
  );
}
