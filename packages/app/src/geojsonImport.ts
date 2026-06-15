import {
  parseScene,
  type CrowdSimScene,
  type ScenePoint,
} from "@crowdsim/scene-schema";

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
): CrowdSimScene {
  const features = collectFeatures(input);
  const importedWalls = features.flatMap((feature, index) =>
    wallPointsFromFeature(feature).map((points, wallIndex) => ({
      id: geoJsonEntityId(feature, index, wallIndex),
      geometry: {
        type: "polyline",
        points,
      },
      thickness: 0.2,
    })),
  );

  return parseScene({
    ...baseScene,
    walls: [...baseScene.walls, ...importedWalls],
  });
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
