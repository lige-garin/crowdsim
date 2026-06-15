import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";

export type WeatherCondition =
  | "clear"
  | "cloudy"
  | "cold"
  | "fog"
  | "heat"
  | "rain"
  | "snow"
  | "storm"
  | "wind";

export type WeatherSnapshot = {
  condition: WeatherCondition;
  fetchedAtIso: string;
  location: {
    latitude: number;
    longitude: number;
    name?: string;
  };
  precipitationMmPerHour?: number;
  temperatureCelsius?: number;
  visibilityMeters?: number;
  windMetersPerSecond?: number;
};

export type WeatherMcpRequest = {
  arguments: {
    latitude: number;
    longitude: number;
    units: "metric";
  };
  toolName: "weather.current";
};

export function createWeatherMcpRequest(location: {
  latitude: number;
  longitude: number;
}): WeatherMcpRequest {
  return {
    arguments: {
      latitude: location.latitude,
      longitude: location.longitude,
      units: "metric",
    },
    toolName: "weather.current",
  };
}

export function applyWeatherSnapshotToScene(
  scene: CrowdSimScene,
  snapshot: WeatherSnapshot,
): CrowdSimScene {
  return parseScene({
    ...scene,
    environmentFactors: [
      ...scene.environmentFactors.filter((factor) => !factor.id.startsWith("weather-")),
      ...createEnvironmentFactorsFromWeatherSnapshot(snapshot),
    ],
  });
}

export function createEnvironmentFactorsFromWeatherSnapshot(snapshot: WeatherSnapshot) {
  const severity = calculateWeatherSeverity(snapshot);
  const startsAtSeconds = 0;
  const base = {
    customParameters: {
      fetchedAtIso: snapshot.fetchedAtIso,
      latitude: snapshot.location.latitude,
      longitude: snapshot.location.longitude,
      provider: "mcp-weather",
    },
    severity,
    startsAtSeconds,
  };

  if (severity <= 0 && snapshot.condition !== "clear") {
    return [];
  }

  if (snapshot.condition === "rain") {
    return [
      {
        ...base,
        id: "weather-rain",
        kind: "rain" as const,
        routeCostMultiplier: 1 + severity * 0.28,
        speedMultiplier: 1 - severity * 0.18,
        visibilityMultiplier: 1 - severity * 0.12,
      },
    ];
  }

  if (snapshot.condition === "fog") {
    return [
      {
        ...base,
        id: "weather-fog",
        kind: "fog" as const,
        routeCostMultiplier: 1 + severity * 0.35,
        speedMultiplier: 1 - severity * 0.1,
        visibilityMultiplier: Math.max(0.2, 1 - severity * 0.75),
      },
    ];
  }

  if (snapshot.condition === "snow" || snapshot.condition === "storm") {
    return [
      {
        ...base,
        id: `weather-${snapshot.condition}`,
        kind: snapshot.condition,
        riskScore: severity * 0.35,
        routeCostMultiplier: 1 + severity * 0.55,
        speedMultiplier: 1 - severity * 0.28,
        visibilityMultiplier: 1 - severity * 0.25,
      },
    ];
  }

  if (
    snapshot.condition === "cold" ||
    snapshot.condition === "heat" ||
    snapshot.condition === "wind"
  ) {
    return [
      {
        ...base,
        id: `weather-${snapshot.condition}`,
        kind: snapshot.condition,
        riskScore: severity * 0.22,
        routeCostMultiplier: 1 + severity * 0.18,
        speedMultiplier: 1 - severity * 0.12,
      },
    ];
  }

  return [];
}

function calculateWeatherSeverity(snapshot: WeatherSnapshot) {
  const precipitation = Math.min(1, (snapshot.precipitationMmPerHour ?? 0) / 20);
  const wind = Math.min(1, (snapshot.windMetersPerSecond ?? 0) / 25);
  const fog =
    snapshot.visibilityMeters === undefined
      ? 0
      : Math.max(0, Math.min(1, (1000 - snapshot.visibilityMeters) / 1000));
  const heat =
    snapshot.temperatureCelsius === undefined
      ? 0
      : Math.max(0, Math.min(1, (snapshot.temperatureCelsius - 32) / 14));
  const cold =
    snapshot.temperatureCelsius === undefined
      ? 0
      : Math.max(0, Math.min(1, (0 - snapshot.temperatureCelsius) / 18));

  return round(Math.max(precipitation, wind, fog, heat, cold));
}

function round(value: number) {
  return Number(value.toFixed(4));
}
