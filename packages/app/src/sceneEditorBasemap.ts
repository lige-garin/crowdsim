import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import { clamp } from "./numberUtils";

export type EditorBasemap = CrowdSimScene["basemaps"][number];

export type BasemapNumberField =
  | "heightMeters"
  | "imageDistancePixels"
  | "opacity"
  | "realDistanceMeters"
  | "rotationDegrees"
  | "scale"
  | "widthMeters"
  | "x"
  | "y";

type ImportedBasemapInput = {
  name: string;
  sourceUri: string;
};

export function getActiveBasemap(scene: CrowdSimScene): EditorBasemap | null {
  return scene.basemaps.find((basemap) => basemap.visible) ?? null;
}

export function addImportedBasemap(
  scene: CrowdSimScene,
  input: ImportedBasemapInput,
): CrowdSimScene {
  const id = nextBasemapId(scene);

  return parseScene({
    ...scene,
    basemaps: [
      ...scene.basemaps.map((basemap) => ({ ...basemap, visible: false })),
      {
        id,
        name: input.name,
        sourceUri: input.sourceUri,
        heightMeters: scene.world.height,
        widthMeters: scene.world.width,
      },
    ],
  });
}

export function updateBasemapNumber(
  scene: CrowdSimScene,
  basemapId: string,
  field: BasemapNumberField,
  value: number,
): CrowdSimScene {
  if (field === "imageDistancePixels" || field === "realDistanceMeters") {
    return updateBasemapCalibration(scene, basemapId, field, value);
  }

  return parseScene({
    ...scene,
    basemaps: scene.basemaps.map((basemap) =>
      basemap.id === basemapId ? updateBasemapScalar(basemap, field, value) : basemap,
    ),
  });
}

export function toggleBasemapBoolean(
  scene: CrowdSimScene,
  basemapId: string,
  field: "locked" | "visible",
): CrowdSimScene {
  return parseScene({
    ...scene,
    basemaps: scene.basemaps.map((basemap) =>
      basemap.id === basemapId ? { ...basemap, [field]: !basemap[field] } : basemap,
    ),
  });
}

function updateBasemapScalar(
  basemap: EditorBasemap,
  field: Exclude<BasemapNumberField, "imageDistancePixels" | "realDistanceMeters">,
  value: number,
): EditorBasemap {
  if (field === "opacity") {
    return { ...basemap, opacity: clamp(value, 0, 1) };
  }

  if (field === "widthMeters" || field === "heightMeters") {
    return { ...basemap, [field]: Math.max(0.1, value) };
  }

  return {
    ...basemap,
    transform: {
      ...basemap.transform,
      [field]: field === "scale" ? Math.max(0.01, value) : value,
    },
  };
}

function updateBasemapCalibration(
  scene: CrowdSimScene,
  basemapId: string,
  field: "imageDistancePixels" | "realDistanceMeters",
  value: number,
) {
  return parseScene({
    ...scene,
    basemaps: scene.basemaps.map((basemap) => {
      if (basemap.id !== basemapId) {
        return basemap;
      }

      const currentImageDistance =
        distanceBetweenCalibrationPoints(basemap) || defaultImageDistance(basemap);
      const imageDistancePixels =
        field === "imageDistancePixels" ? Math.max(1, value) : currentImageDistance;
      const realDistanceMeters =
        field === "realDistanceMeters"
          ? Math.max(0.1, value)
          : (basemap.calibration?.realDistanceMeters ?? imageDistancePixels);

      return {
        ...basemap,
        calibration: {
          imagePointA: { x: 0, y: 0 },
          imagePointB: { x: imageDistancePixels, y: 0 },
          metersPerPixel: realDistanceMeters / imageDistancePixels,
          realDistanceMeters,
        },
      };
    }),
  });
}

function nextBasemapId(scene: CrowdSimScene) {
  let index = scene.basemaps.length + 1;
  let id = `basemap-${index}`;
  const existingIds = new Set(scene.basemaps.map((basemap) => basemap.id));

  while (existingIds.has(id)) {
    index++;
    id = `basemap-${index}`;
  }

  return id;
}

function distanceBetweenCalibrationPoints(basemap: EditorBasemap) {
  const calibration = basemap.calibration;

  if (!calibration) {
    return 0;
  }

  return Math.hypot(
    calibration.imagePointB.x - calibration.imagePointA.x,
    calibration.imagePointB.y - calibration.imagePointA.y,
  );
}

function defaultImageDistance(basemap: EditorBasemap) {
  return Math.max(1, basemap.widthMeters ?? 1);
}
