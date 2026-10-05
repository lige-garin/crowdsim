import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";
import { nearestSegmentHeadingRadians } from "../editor/sceneEditorGeometry";
import { createSceneRuntimeConditions } from "../engine/sceneRuntimeConditions";
import { streetscapeBlueprint } from "./streetscapeBlueprint";

export type SceneRenderPrimitive =
  | {
      color: string;
      end: ScenePoint;
      id: string;
      kind: "road" | "obstacle" | "line";
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
    }
  | {
      color: string;
      id: string;
      kind: "crosswalk";
      position: ScenePoint;
      widthMeters: number;
      /** Which way its own road runs at `position` (`atan2`, scene
       * radians) — the stripe's short side (`widthMeters`) runs along
       * this, its long side across `roadWidthMeters`. */
      headingRadians: number;
      /** How far it spans across the road — the road's own `widthMeters`,
       * not the crosswalk's (a crosswalk's `widthMeters` is the stripe's
       * own depth along the road, not how far it reaches across one). Falls
       * back to the crosswalk's own `widthMeters` (a square, the same shape
       * this primitive always drew) for a `roadId` that no longer resolves
       * to a real road, so an edit that orphans one still draws something
       * instead of a zero-size mesh.
       */
      roadWidthMeters: number;
    }
  | {
      color: string;
      id: string;
      kind: "trafficSignal";
      position: ScenePoint;
      radiusMeters: number;
    }
  | {
      color: string;
      id: string;
      /** A point placed in the 3D world that the scene otherwise draws
       * nothing for: entrances, targets, service points, connectors. */
      kind: "marker";
      position: ScenePoint;
      radiusMeters: number;
    }
  | {
      color: string;
      id: string;
      kind: "zone";
      points: ScenePoint[];
    };

export type SceneWeatherVisualState = {
  condition: string;
  fogDensity: number;
  fogOpacity: number;
  precipitationIntensity: number;
  rainStreaks: SceneWeatherLine[];
  windIndicators: SceneWeatherLine[];
  windVector: ScenePoint;
};

export type SceneWeatherLine = {
  end: ScenePoint;
  id: string;
  intensity: number;
  start: ScenePoint;
};

export type SceneRenderAssetPlacement = {
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

export type SceneRenderPlan = {
  assets: SceneRenderAssetPlacement[];
  primitives: SceneRenderPrimitive[];
  weather: SceneWeatherVisualState;
};

export function createSceneRenderPlan(
  scene: CrowdSimScene,
  elapsedSeconds = 0,
): SceneRenderPlan {
  const weather = createSceneRuntimeConditions(scene, elapsedSeconds);
  const activeHazardIds = new Set(weather.activeHazardIds);
  const primitives: SceneRenderPrimitive[] = [
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
    // Procedural filler blocks so the city reads as a dense skyline instead of
    // a few isolated boxes; the named scene buildings layer on top.
    ...streetscapeBlueprint(scene.world, scene.seed).map((b, index) => ({
      color: b.color,
      heightMeters: b.height,
      id: `filler-${index}`,
      kind: "building" as const,
      points: [
        { x: b.x - b.width / 2, y: b.y - b.depth / 2 },
        { x: b.x + b.width / 2, y: b.y - b.depth / 2 },
        { x: b.x + b.width / 2, y: b.y + b.depth / 2 },
        { x: b.x - b.width / 2, y: b.y + b.depth / 2 },
      ],
    })),
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
    ...scene.crosswalks.map((crosswalk) => {
      const road = scene.roads.find((candidate) => candidate.id === crosswalk.roadId);
      return {
        color: "#f8fafc",
        id: `crosswalk-${crosswalk.id}`,
        kind: "crosswalk" as const,
        position: copyPoint(crosswalk.position),
        widthMeters: crosswalk.widthMeters,
        headingRadians:
          road === undefined
            ? 0
            : nearestSegmentHeadingRadians(crosswalk.position, road.geometry.points),
        roadWidthMeters: road?.widthMeters ?? crosswalk.widthMeters,
      };
    }),
    ...scene.trafficSignals.map((signal) => ({
      color: "#f97316",
      id: `traffic-signal-${signal.id}`,
      kind: "trafficSignal" as const,
      position: copyPoint(signal.position),
      radiusMeters: 1,
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
    // Everything below is placeable in the 3D world and was previously drawn
    // nowhere in it: placing an exit succeeded and changed nothing on screen,
    // which reads as "the click did nothing" (see worldPlacement.placeInScene).
    ...scene.entrances.map((entrance) => ({
      color: entrance.kind === "source" ? "#22c55e" : "#f59e0b",
      id: `entrance-${entrance.id}`,
      kind: "marker" as const,
      position: copyPoint(entrance.position),
      radiusMeters: Math.max(1.2, entrance.width / 2),
    })),
    ...scene.targets.map((target) => ({
      color: "#0ea5e9",
      id: `target-${target.id}`,
      kind: "marker" as const,
      position: copyPoint(target.position),
      radiusMeters: Math.max(1.2, target.radius),
    })),
    ...scene.servicePoints.map((point) => ({
      color: "#8b5cf6",
      id: `service-${point.id}`,
      kind: "marker" as const,
      position: copyPoint(point.position),
      radiusMeters: Math.max(1.2, point.width / 2),
    })),
    ...scene.connectors.map((connector) => ({
      color: "#6366f1",
      id: `connector-${connector.id}`,
      kind: "marker" as const,
      position: copyPoint(connector.from.point),
      radiusMeters: Math.max(1.2, connector.width / 2),
    })),
    ...scene.zones.map((zone) => ({
      color: "#2dd4bf",
      id: `zone-${zone.id}`,
      kind: "zone" as const,
      points: zone.geometry.points.map(copyPoint),
    })),
    ...scene.countLines.flatMap((line) =>
      line.geometry.points.slice(1).map((point, index) => ({
        color: "#facc15",
        end: copyPoint(point),
        id: `count-line-${line.id}-${index}`,
        kind: "line" as const,
        start: copyPoint(line.geometry.points[index]),
        widthMeters: 0.7,
      })),
    ),
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
): SceneWeatherLine[] {
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
): SceneWeatherLine[] {
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
