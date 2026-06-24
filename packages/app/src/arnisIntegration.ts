import type { CrowdSimScene } from "@crowdsim/scene-schema";
import {
  createVisualAssetManifest,
  type VisualAssetManifestItem,
} from "./visualAssets";

export type ArnisBoundingBox = {
  east: number;
  north: number;
  south: number;
  west: number;
};

export type ArnisMapSourceConfig = {
  attribution: "OpenStreetMap contributors; Arnis Apache-2.0";
  bbox: ArnisBoundingBox;
  license: "Apache-2.0";
  maxRecommendedAreaKm2: number;
  mode: "external-generator";
  outputDirectory: string;
  projectUrl: "https://github.com/louis-e/arnis";
  provider: "arnis";
  purpose: "real-world-osm-to-visual-basemap";
};

export type ArnisIntegrationPlan = {
  browserRuntime: "import-generated-asset";
  command: readonly string[];
  generatedAssetRoute: string;
  generator: "arnis";
  inputData: readonly ["OpenStreetMap", "terrain/elevation"];
  outputExpectation: "minecraft-world-first";
  recommendedConversion: readonly [
    "Generate Minecraft world externally",
    "Convert selected chunks or exported mesh to GLB/3D Tiles",
    "Register the converted asset as visual-only BioCity context",
    "Keep simulation roads, hazards, walkable space, and collision in .csim.json",
  ];
  sceneAsset: VisualAssetManifestItem;
};

export function createArnisMapSourceConfig(options: {
  bbox: ArnisBoundingBox;
  maxRecommendedAreaKm2?: number;
  outputDirectory: string;
}): ArnisMapSourceConfig {
  validateArnisBoundingBox(options.bbox);

  const maxRecommendedAreaKm2 = options.maxRecommendedAreaKm2 ?? 25;
  const areaKm2 = estimateBoundingBoxAreaKm2(options.bbox);

  if (areaKm2 > maxRecommendedAreaKm2) {
    throw new Error(
      `Arnis map area ${areaKm2.toFixed(2)} km2 exceeds recommended ${maxRecommendedAreaKm2} km2`,
    );
  }

  if (!options.outputDirectory.trim()) {
    throw new Error("Arnis output directory is required");
  }

  return {
    attribution: "OpenStreetMap contributors; Arnis Apache-2.0",
    bbox: { ...options.bbox },
    license: "Apache-2.0",
    maxRecommendedAreaKm2,
    mode: "external-generator",
    outputDirectory: options.outputDirectory,
    projectUrl: "https://github.com/louis-e/arnis",
    provider: "arnis",
    purpose: "real-world-osm-to-visual-basemap",
  };
}

export function createArnisIntegrationPlan(options: {
  bbox: ArnisBoundingBox;
  generatedAssetRoute?: string;
  outputDirectory: string;
  scene: CrowdSimScene;
}): ArnisIntegrationPlan {
  const config = createArnisMapSourceConfig({
    bbox: options.bbox,
    outputDirectory: options.outputDirectory,
  });
  const generatedAssetRoute =
    options.generatedAssetRoute ?? "/assets/biocity/arnis-generated-context.glb";
  const sceneAsset = createArnisVisualAsset(options.scene, generatedAssetRoute);

  createVisualAssetManifest([sceneAsset]);

  return {
    browserRuntime: "import-generated-asset",
    command: createArnisCliCommand(config),
    generatedAssetRoute,
    generator: "arnis",
    inputData: ["OpenStreetMap", "terrain/elevation"],
    outputExpectation: "minecraft-world-first",
    recommendedConversion: [
      "Generate Minecraft world externally",
      "Convert selected chunks or exported mesh to GLB/3D Tiles",
      "Register the converted asset as visual-only BioCity context",
      "Keep simulation roads, hazards, walkable space, and collision in .csim.json",
    ],
    sceneAsset,
  };
}

export function createArnisCliCommand(config: ArnisMapSourceConfig) {
  return [
    "arnis",
    "--bbox",
    [config.bbox.west, config.bbox.south, config.bbox.east, config.bbox.north].join(
      ",",
    ),
    "--output",
    config.outputDirectory,
  ] as const;
}

export function createArnisVisualAsset(
  scene: CrowdSimScene,
  sourceUrl: string,
): VisualAssetManifestItem {
  if (!sourceUrl.startsWith("/")) {
    throw new Error("Arnis generated asset route must be a relative app route");
  }

  return {
    anchor: {
      x: scene.world.width / 2,
      y: scene.world.height / 2,
      z: 0,
    },
    calibration: {
      origin: "scene-anchor",
      simulationProxy: scene.areas[0]
        ? {
            entityId: scene.areas[0].id,
            kind: "area",
            role: "alignment-only",
          }
        : undefined,
      unitScaleMeters: 1,
      upAxis: "y-up",
      verified: false,
    },
    collisionMode: "none",
    id: "arnis-generated-context",
    kind: sourceUrl.endsWith(".json") ? "tileset" : "gltf-scene",
    lodSources: {},
    scale: 1,
    sourceUrl,
  };
}

export function estimateBoundingBoxAreaKm2(bbox: ArnisBoundingBox) {
  validateArnisBoundingBox(bbox);

  const meanLatitudeRadians = (((bbox.north + bbox.south) / 2) * Math.PI) / 180;
  const kmPerDegreeLatitude = 111.32;
  const widthKm =
    (bbox.east - bbox.west) * kmPerDegreeLatitude * Math.cos(meanLatitudeRadians);
  const heightKm = (bbox.north - bbox.south) * kmPerDegreeLatitude;

  return Math.abs(widthKm * heightKm);
}

function validateArnisBoundingBox(bbox: ArnisBoundingBox) {
  for (const [key, value] of Object.entries(bbox)) {
    if (!Number.isFinite(value)) {
      throw new Error(`Arnis bbox ${key} must be finite`);
    }
  }

  if (bbox.south >= bbox.north) {
    throw new Error("Arnis bbox south must be below north");
  }

  if (bbox.west >= bbox.east) {
    throw new Error("Arnis bbox west must be left of east");
  }

  if (bbox.south < -90 || bbox.north > 90) {
    throw new Error("Arnis bbox latitude must be between -90 and 90");
  }

  if (bbox.west < -180 || bbox.east > 180) {
    throw new Error("Arnis bbox longitude must be between -180 and 180");
  }
}
