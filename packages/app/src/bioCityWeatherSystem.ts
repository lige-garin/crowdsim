import type { CrowdSimScene } from "@crowdsim/scene-schema";

type WeatherSample = CrowdSimScene["weatherProfile"]["samples"][number];
type EnvironmentFactor = CrowdSimScene["environmentFactors"][number];
type CityEvent = CrowdSimScene["eventTimeline"]["events"][number];
type Hazard = CrowdSimScene["hazards"][number];

export type BioCityWeatherRuntimeState = {
  activeEventIds: string[];
  activeHazardIds: string[];
  currentWeatherSample?: WeatherSample;
  environmentFactors: EnvironmentFactor[];
};

export function createBioCityWeatherRuntimeState(
  scene: CrowdSimScene,
  elapsedSeconds = 0,
): BioCityWeatherRuntimeState {
  const activeEvents = getActiveCityEvents(scene, elapsedSeconds);
  const activeHazards = getActiveHazards(scene, elapsedSeconds);
  const currentWeatherSample = getActiveWeatherSample(scene, elapsedSeconds);

  return {
    activeEventIds: activeEvents.map((event) => event.id),
    activeHazardIds: activeHazards.map((hazard) => hazard.id),
    currentWeatherSample,
    environmentFactors: [
      ...weatherSampleToEnvironmentFactors(currentWeatherSample),
      ...activeEvents.flatMap(cityEventToEnvironmentFactors),
      // fire/smoke excluded (ADR-0012): those two kinds now have their own
      // localized, distance-and-time model (smokeHazards.ts,
      // simulationEngine's applyHazardExposure) — someone across the
      // building from a small fire is not exposed to it. Folding them in
      // here too would apply the same hazard's speedMultiplier a second
      // time, uniformly across the whole scene regardless of distance,
      // which is exactly the crude effect ADR-0012 was written to replace
      // for these two kinds. Every other hazard kind (crowdSurge, flood,
      // powerOutage, roadClosure, securityIncident, transitDisruption) has
      // no localized model of its own, so it keeps this scene-wide
      // treatment — crude, but the only effect any of them has ever had.
      ...activeHazards
        .filter((hazard) => hazard.kind !== "fire" && hazard.kind !== "smoke")
        .map(hazardToEnvironmentFactor),
    ],
  };
}

export function getActiveWeatherSample(scene: CrowdSimScene, elapsedSeconds: number) {
  return scene.weatherProfile.samples
    .filter(
      (sample) =>
        sample.startsAtSeconds <= elapsedSeconds &&
        sample.startsAtSeconds + sample.durationSeconds >= elapsedSeconds,
    )
    .sort((left, right) => right.startsAtSeconds - left.startsAtSeconds)[0];
}

export function getActiveCityEvents(scene: CrowdSimScene, elapsedSeconds: number) {
  return scene.eventTimeline.events.filter((event) =>
    isActiveWindow(event, elapsedSeconds),
  );
}

export function getActiveHazards(scene: CrowdSimScene, elapsedSeconds: number) {
  return scene.hazards.filter((hazard) => isActiveWindow(hazard, elapsedSeconds));
}

function weatherSampleToEnvironmentFactors(
  sample: WeatherSample | undefined,
): EnvironmentFactor[] {
  if (!sample || sample.condition === "clear" || sample.condition === "cloudy") {
    return [];
  }

  const severity = weatherSeverity(sample);
  const kind = weatherConditionToEnvironmentKind(sample.condition);

  return [
    {
      id: `weather-profile-${sample.condition}-${sample.startsAtSeconds}`,
      kind,
      startsAtSeconds: sample.startsAtSeconds,
      endsAtSeconds: sample.startsAtSeconds + sample.durationSeconds,
      severity,
      riskScore: weatherRiskScore(sample.condition, severity),
      routeCostMultiplier: weatherRouteCostMultiplier(sample.condition, severity),
      speedMultiplier: weatherSpeedMultiplier(sample.condition, severity),
      visibilityMultiplier: weatherVisibilityMultiplier(sample, severity),
      behaviorTags: ["weather"],
      customParameters: {
        condition: sample.condition,
        source: "weatherProfile",
      },
    },
  ];
}

function cityEventToEnvironmentFactors(event: CityEvent): EnvironmentFactor[] {
  if (event.kind === "roadClose") {
    return [
      {
        id: `event-${event.id}`,
        kind: "exitClosed",
        startsAtSeconds: event.startsAtSeconds,
        endsAtSeconds: event.endsAtSeconds,
        targetId: event.targetId,
        severity: 0.65,
        riskScore: 0.24,
        routeCostMultiplier: 2.25,
        speedMultiplier: 0.82,
        visibilityMultiplier: 1,
        behaviorTags: ["road-closure"],
        customParameters: {
          eventKind: event.kind,
          source: "eventTimeline",
        },
      },
    ];
  }

  if (event.kind === "transitDelay") {
    const delayFactor =
      typeof event.payload.delayFactor === "number" ? event.payload.delayFactor : 1.35;

    return [
      {
        id: `event-${event.id}`,
        kind: "trainDelay",
        startsAtSeconds: event.startsAtSeconds,
        endsAtSeconds: event.endsAtSeconds,
        targetId: event.targetId,
        severity: Math.min(1, Math.max(0.1, delayFactor - 1)),
        riskScore: 0.08,
        routeCostMultiplier: delayFactor,
        speedMultiplier: 1,
        visibilityMultiplier: 1,
        behaviorTags: ["transit-delay"],
        customParameters: {
          delayFactor,
          eventKind: event.kind,
          source: "eventTimeline",
        },
      },
    ];
  }

  if (event.kind === "hazardStart") {
    return [
      {
        id: `event-${event.id}`,
        kind: "announcement",
        startsAtSeconds: event.startsAtSeconds,
        endsAtSeconds: event.endsAtSeconds,
        targetId: event.targetId,
        severity: 0.45,
        riskScore: 0.12,
        routeCostMultiplier: 1.15,
        speedMultiplier: 0.96,
        visibilityMultiplier: 1,
        behaviorTags: ["hazard-warning"],
        customParameters: {
          eventKind: event.kind,
          source: "eventTimeline",
        },
      },
    ];
  }

  return [];
}

function hazardToEnvironmentFactor(hazard: Hazard): EnvironmentFactor {
  return {
    id: `hazard-${hazard.id}`,
    kind: hazardKindToEnvironmentKind(hazard.kind),
    startsAtSeconds: hazard.startsAtSeconds,
    endsAtSeconds: hazard.endsAtSeconds,
    severity: hazard.severity,
    riskScore: hazard.riskScore,
    routeCostMultiplier: hazard.routeCostMultiplier,
    speedMultiplier: hazard.speedMultiplier,
    visibilityMultiplier: hazard.visibilityMultiplier,
    behaviorTags: ["hazard"],
    customParameters: {
      hazardKind: hazard.kind,
      source: "hazards",
    },
  };
}

function hazardKindToEnvironmentKind(kind: Hazard["kind"]): EnvironmentFactor["kind"] {
  if (kind === "flood") return "flood";
  if (kind === "fire") return "fire";
  if (kind === "smoke") return "smoke";
  if (kind === "powerOutage") return "powerOutage";
  if (kind === "transitDisruption") return "trainDelay";

  return "rumor";
}

function weatherConditionToEnvironmentKind(
  condition: WeatherSample["condition"],
): EnvironmentFactor["kind"] {
  switch (condition) {
    case "cold":
    case "fog":
    case "heat":
    case "rain":
    case "snow":
    case "storm":
    case "wind":
      return condition;
    case "heavyRain":
      return "rain";
    case "clear":
    case "cloudy":
      return "wind";
  }
}

function weatherSeverity(sample: WeatherSample) {
  const precipitation = Math.min(1, sample.precipitationMmPerHour / 20);
  const wind = Math.min(1, sample.windSpeedMetersPerSecond / 25);
  const visibility =
    sample.visibilityMeters === undefined
      ? 0
      : Math.max(0, Math.min(1, (2500 - sample.visibilityMeters) / 2500));
  const heat = Math.max(0, Math.min(1, (sample.temperatureC - 32) / 14));
  const cold = Math.max(0, Math.min(1, (0 - sample.temperatureC) / 18));
  const conditionBaseline =
    sample.condition === "heavyRain" || sample.condition === "storm" ? 0.55 : 0.2;

  return round(
    Math.max(conditionBaseline, precipitation, wind, visibility, heat, cold),
  );
}

function weatherRiskScore(condition: WeatherSample["condition"], severity: number) {
  if (condition === "storm" || condition === "heavyRain") return severity * 0.38;
  if (condition === "fog" || condition === "snow") return severity * 0.24;
  if (condition === "heat" || condition === "cold") return severity * 0.18;

  return severity * 0.1;
}

function weatherRouteCostMultiplier(
  condition: WeatherSample["condition"],
  severity: number,
) {
  if (condition === "storm" || condition === "heavyRain") return 1 + severity * 0.68;
  if (condition === "rain" || condition === "snow") return 1 + severity * 0.42;
  if (condition === "fog" || condition === "wind") return 1 + severity * 0.3;

  return 1 + severity * 0.16;
}

function weatherSpeedMultiplier(
  condition: WeatherSample["condition"],
  severity: number,
) {
  if (condition === "storm" || condition === "heavyRain") return 1 - severity * 0.3;
  if (condition === "rain" || condition === "snow") return 1 - severity * 0.2;
  if (condition === "fog" || condition === "wind") return 1 - severity * 0.12;

  return 1 - severity * 0.08;
}

function weatherVisibilityMultiplier(sample: WeatherSample, severity: number) {
  if (sample.visibilityMeters !== undefined) {
    return Math.max(0.15, Math.min(1, sample.visibilityMeters / 5000));
  }

  if (sample.condition === "fog") return Math.max(0.2, 1 - severity * 0.75);
  if (sample.condition === "storm" || sample.condition === "heavyRain") {
    return Math.max(0.35, 1 - severity * 0.35);
  }

  return 1;
}

function isActiveWindow(
  item: { startsAtSeconds: number; endsAtSeconds?: number },
  elapsedSeconds: number,
) {
  return (
    item.startsAtSeconds <= elapsedSeconds &&
    (item.endsAtSeconds === undefined || item.endsAtSeconds >= elapsedSeconds)
  );
}

function round(value: number) {
  return Number(value.toFixed(4));
}
