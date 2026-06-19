import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";
import { createBioCityWeatherRuntimeState } from "./bioCityWeatherSystem";

export type BioCityRenderPrimitive =
  | {
      color: string;
      end: ScenePoint;
      id: string;
      kind: "road" | "obstacle";
      start: ScenePoint;
      widthMeters: number;
    }
  | {
      color: string;
      heightMeters: number;
      id: string;
      kind: "building";
      points: ScenePoint[];
    }
  | {
      color: string;
      id: string;
      kind: "transitStop";
      position: ScenePoint;
      radiusMeters: number;
    }
  | {
      color: string;
      id: string;
      kind: "hazard";
      opacity: number;
      position: ScenePoint;
      radiusMeters: number;
    };

export type BioCityWeatherVisualState = {
  condition: string;
  fogDensity: number;
  fogOpacity: number;
  precipitationIntensity: number;
  rainStreaks: BioCityWeatherLine[];
  windIndicators: BioCityWeatherLine[];
  windVector: ScenePoint;
};

export type BioCityWeatherLine = {
  end: ScenePoint;
  id: string;
  intensity: number;
  start: ScenePoint;
};

export type BioCityRenderAssetPlacement = {
  anchor: {
    x: number;
    y: number;
    z: number;
  };
  calibration: {
    origin: CrowdSimScene["visualAssets"][number]["calibration"]["origin"];
    simulationProxy?: CrowdSimScene["visualAssets"][number]["calibration"]["simulationProxy"];
    unitScaleMeters: number;
    upAxis: CrowdSimScene["visualAssets"][number]["calibration"]["upAxis"];
    verified: boolean;
  };
  id: string;
  kind: CrowdSimScene["visualAssets"][number]["kind"];
  lod: CrowdSimScene["visualAssets"][number]["lod"];
  lodSources: CrowdSimScene["visualAssets"][number]["lodSources"];
  rotationDegrees: number;
  scale: number;
  sourceUrl: string;
};

export type BioCityRenderPlan = {
  assets: BioCityRenderAssetPlacement[];
  primitives: BioCityRenderPrimitive[];
  weather: BioCityWeatherVisualState;
};

export function createBioCityRenderPlan(
  scene: CrowdSimScene,
  elapsedSeconds = 0,
): BioCityRenderPlan {
  const weather = createBioCityWeatherRuntimeState(scene, elapsedSeconds);
  const activeHazardIds = new Set(weather.activeHazardIds);
  const primitives: BioCityRenderPrimitive[] = [
    ...scene.roads.flatMap((road) =>
      road.geometry.points.slice(1).map((point, index) => ({
        color: road.transitOnly ? "#38bdf8" : "#64748b",
        end: copyPoint(point),
        id: `road-${road.id}-${index}`,
        kind: "road" as const,
        start: copyPoint(road.geometry.points[index]),
        widthMeters: road.widthMeters,
      })),
    ),
    ...scene.buildings.map((building) => ({
      color: buildingColor(building.kind),
      heightMeters: building.heightMeters,
      id: `building-${building.id}`,
      kind: "building" as const,
      points: building.footprint.points.map(copyPoint),
    })),
    ...scene.transitStops.map((stop) => ({
      color: stop.active ? "#0ea5e9" : "#94a3b8",
      id: `transit-${stop.id}`,
      kind: "transitStop" as const,
      position: copyPoint(stop.position),
      radiusMeters: Math.max(1.6, Math.min(3.2, stop.capacity / 42)),
    })),
    ...scene.obstacles.flatMap((obstacle) =>
      obstacle.geometry.points.slice(1).map((point, index) => ({
        color: obstacle.blocksMovement ? "#475569" : "#94a3b8",
        end: copyPoint(point),
        id: `obstacle-${obstacle.id}-${index}`,
        kind: "obstacle" as const,
        start: copyPoint(obstacle.geometry.points[index]),
        widthMeters: obstacle.blocksMovement ? 1.2 : 0.7,
      })),
    ),
    ...scene.hazards.map((hazard) => ({
      color: activeHazardIds.has(hazard.id) ? "#ef4444" : "#f97316",
      id: `hazard-${hazard.id}`,
      kind: "hazard" as const,
      opacity: activeHazardIds.has(hazard.id) ? 0.38 : 0.16,
      position: copyPoint(hazard.position),
      radiusMeters: hazard.radiusMeters,
    })),
  ];

  return {
    assets: scene.visualAssets
      .filter((asset) => asset.visible)
      .map((asset) => ({
        anchor: { ...asset.anchor },
        calibration: {
          origin: asset.calibration.origin,
          simulationProxy: asset.calibration.simulationProxy
            ? { ...asset.calibration.simulationProxy }
            : undefined,
          unitScaleMeters: asset.calibration.unitScaleMeters,
          upAxis: asset.calibration.upAxis,
          verified: asset.calibration.verified,
        },
        id: `asset-${asset.id}`,
        kind: asset.kind,
        lod: asset.lod,
        lodSources: { ...asset.lodSources },
        rotationDegrees: asset.rotationDegrees,
        scale: asset.scale,
        sourceUrl: asset.sourceUrl,
      })),
    primitives,
    weather: {
      condition: weather.currentWeatherSample?.condition ?? "clear",
      fogDensity: fogDensity(weather.currentWeatherSample),
      fogOpacity: fogOpacity(weather.currentWeatherSample),
      precipitationIntensity: precipitationIntensity(weather.currentWeatherSample),
      rainStreaks: rainStreaks(scene, weather.currentWeatherSample),
      windIndicators: windIndicators(scene, weather.currentWeatherSample),
      windVector: windVector(weather.currentWeatherSample),
    },
  };
}

function buildingColor(kind: CrowdSimScene["buildings"][number]["kind"]) {
  if (kind === "retail") return "#8b5cf6";
  if (kind === "transit") return "#0ea5e9";
  if (kind === "shelter") return "#22c55e";
  if (kind === "office") return "#475569";
  if (kind === "residential") return "#f59e0b";

  return "#64748b";
}

function fogDensity(
  sample: CrowdSimScene["weatherProfile"]["samples"][number] | undefined,
) {
  if (!sample) return 0;
  if (sample.condition !== "fog" && sample.condition !== "storm") return 0;

  return sample.visibilityMeters === undefined
    ? 0.18
    : Math.max(0, Math.min(0.45, (2500 - sample.visibilityMeters) / 5500));
}

function precipitationIntensity(
  sample: CrowdSimScene["weatherProfile"]["samples"][number] | undefined,
) {
  if (!sample) return 0;

  return Math.min(1, sample.precipitationMmPerHour / 20);
}

function fogOpacity(
  sample: CrowdSimScene["weatherProfile"]["samples"][number] | undefined,
) {
  if (!sample) return 0;

  return Number(
    Math.max(
      fogDensity(sample),
      Math.min(0.28, precipitationIntensity(sample) * 0.18),
    ).toFixed(3),
  );
}

function windVector(
  sample: CrowdSimScene["weatherProfile"]["samples"][number] | undefined,
): ScenePoint {
  if (!sample || sample.windSpeedMetersPerSecond <= 0) {
    return { x: 0, y: 0 };
  }

  const radians = (sample.windDirectionDegrees * Math.PI) / 180;
  const scale = Math.min(1, sample.windSpeedMetersPerSecond / 20);

  return {
    x: Number((Math.cos(radians) * scale).toFixed(4)),
    y: Number((Math.sin(radians) * scale).toFixed(4)),
  };
}

function rainStreaks(
  scene: CrowdSimScene,
  sample: CrowdSimScene["weatherProfile"]["samples"][number] | undefined,
): BioCityWeatherLine[] {
  const intensity = precipitationIntensity(sample);

  if (intensity <= 0) {
    return [];
  }

  const wind = windVector(sample);
  const count = Math.max(4, Math.round(8 + intensity * 18));
  const length = 3.5 + intensity * 4;

  return Array.from({ length: count }, (_, index) => {
    const x = ((index * 37) % 100) / 100;
    const y = ((index * 53 + 11) % 100) / 100;
    const start = {
      x: Number((x * scene.world.width).toFixed(3)),
      y: Number((y * scene.world.height).toFixed(3)),
    };
    const end = {
      x: Number((start.x + wind.x * length - 1.2 * intensity).toFixed(3)),
      y: Number((start.y + length).toFixed(3)),
    };

    return {
      end,
      id: `rain-${index}`,
      intensity: Number(intensity.toFixed(3)),
      start,
    };
  });
}

function windIndicators(
  scene: CrowdSimScene,
  sample: CrowdSimScene["weatherProfile"]["samples"][number] | undefined,
): BioCityWeatherLine[] {
  const wind = windVector(sample);
  const intensity = Math.hypot(wind.x, wind.y);

  if (intensity <= 0.05) {
    return [];
  }

  const length = 7 + intensity * 6;

  return [0.25, 0.5, 0.75].map((y, index) => {
    const start = {
      x: Number((scene.world.width * 0.12).toFixed(3)),
      y: Number((scene.world.height * y).toFixed(3)),
    };

    return {
      end: {
        x: Number((start.x + wind.x * length).toFixed(3)),
        y: Number((start.y + wind.y * length).toFixed(3)),
      },
      id: `wind-${index}`,
      intensity: Number(intensity.toFixed(3)),
      start,
    };
  });
}

function copyPoint(point: ScenePoint): ScenePoint {
  return { x: point.x, y: point.y };
}
