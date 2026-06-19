import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { calculateEnvironmentImpact } from "./environmentEffects";
import type { HeatmapCell } from "./heatmap";
import { createBioCityViewportOverlayPlan } from "./bioCityViewportOverlayPlan";

export type BioCityAnalyticsSummary = {
  activeRiskCount: number;
  buildingPropertyCards: Array<{
    capacity: number;
    id: string;
    kind: string;
    label: string;
    occupancySignalPercent: number;
  }>;
  commercialConversionForecastPercent: number;
  congestionIndexPercent: number;
  heatmapPeak: {
    count: number;
    id: string;
    intensity: number;
  };
  heatmapTrend: Array<{
    id: string;
    intensityPercent: number;
  }>;
  insightLines: string[];
  riskExplanations: string[];
  routeRiskIndexPercent: number;
  salesForecastCards: Array<{
    forecastRevenueIndex: number;
    id: string;
    label: string;
    predictedConversionPercent: number;
  }>;
  topCorridors: Array<{
    id: string;
    intensity: number;
    label: string;
    risk: boolean;
    transitOnly: boolean;
  }>;
  transitStopCards: Array<{
    id: string;
    label: string;
    pressurePercent: number;
    waitMinutes: number;
  }>;
  transitQueuePressurePercent: number;
  weatherImpact: {
    activeFactorIds: string[];
    routeCostMultiplier: number;
    speedMultiplier: number;
    visibilityMultiplier: number;
  };
};

export function createBioCityAnalyticsSummary(options: {
  elapsedSeconds: number;
  heatmapCells: readonly HeatmapCell[];
  scene: CrowdSimScene;
}): BioCityAnalyticsSummary {
  const environmentImpact = calculateEnvironmentImpact(
    options.scene,
    options.elapsedSeconds,
  );
  const overlayPlan = createBioCityViewportOverlayPlan(options.scene, {
    elapsedSeconds: options.elapsedSeconds,
    heatmapCells: options.heatmapCells,
  });
  const heatmapPeak = options.heatmapCells
    .slice()
    .sort((left, right) => right.intensity - left.intensity)[0] ?? {
    count: 0,
    id: "none",
    intensity: 0,
  };
  const topCorridors = overlayPlan.flows
    .slice()
    .sort((left, right) => right.intensity - left.intensity)
    .slice(0, 4)
    .map((flow) => ({
      id: flow.id,
      intensity: flow.intensity,
      label: flow.id.replace(/^flow-/, ""),
      risk: flow.color === "#ef4444",
      transitOnly: flow.transitOnly,
    }));
  const congestionIndexPercent = clampPercent(
    heatmapPeak.intensity * 55 + overlayPlan.summary.activeRiskCount * 18,
  );
  const routeRiskIndexPercent = clampPercent(
    environmentImpact.riskScore * 100 +
      (environmentImpact.routeCostMultiplier - 1) * 28 +
      overlayPlan.summary.activeRiskCount * 12,
  );
  const transitQueuePressurePercent = estimateTransitQueuePressure(options.scene);
  const commercialConversionForecastPercent = estimateCommercialConversion(
    options.scene,
    environmentImpact.storeAttractionMultiplier,
    congestionIndexPercent,
  );

  return {
    activeRiskCount: overlayPlan.summary.activeRiskCount,
    buildingPropertyCards: createBuildingPropertyCards(options.scene),
    commercialConversionForecastPercent,
    congestionIndexPercent,
    heatmapPeak: {
      count: heatmapPeak.count,
      id: heatmapPeak.id,
      intensity: round(heatmapPeak.intensity),
    },
    heatmapTrend: createHeatmapTrend(options.heatmapCells),
    insightLines: createInsightLines({
      commercialConversionForecastPercent,
      congestionIndexPercent,
      routeRiskIndexPercent,
      transitQueuePressurePercent,
    }),
    riskExplanations: createRiskExplanations(options.scene, environmentImpact),
    routeRiskIndexPercent,
    salesForecastCards: createSalesForecastCards(
      options.scene,
      environmentImpact.storeAttractionMultiplier,
      congestionIndexPercent,
    ),
    topCorridors,
    transitStopCards: createTransitStopCards(options.scene),
    transitQueuePressurePercent,
    weatherImpact: {
      activeFactorIds: environmentImpact.activeFactorIds,
      routeCostMultiplier: round(environmentImpact.routeCostMultiplier),
      speedMultiplier: round(environmentImpact.speedMultiplier),
      visibilityMultiplier: round(environmentImpact.visibilityMultiplier),
    },
  };
}

function createHeatmapTrend(heatmapCells: readonly HeatmapCell[]) {
  return heatmapCells
    .slice()
    .sort((left, right) => right.intensity - left.intensity)
    .slice(0, 8)
    .map((cell) => ({
      id: cell.id,
      intensityPercent: clampPercent(cell.intensity * 100),
    }));
}

function estimateTransitQueuePressure(scene: CrowdSimScene) {
  if (scene.transitStops.length === 0) {
    return 0;
  }

  const peakPressure = Math.max(
    ...scene.transitStops.map((stop) => {
      const delayPressure = Math.max(0, stop.delayFactor - 1) * 55;
      const capacityPressure = Math.min(45, stop.capacity / 4);
      const servicePressure =
        stop.boardingCapacityPerMinute === undefined
          ? 10
          : Math.max(0, 35 - stop.boardingCapacityPerMinute);

      return delayPressure + capacityPressure + servicePressure;
    }),
  );

  return clampPercent(peakPressure);
}

function estimateCommercialConversion(
  scene: CrowdSimScene,
  storeAttractionMultiplier: number,
  congestionIndexPercent: number,
) {
  if (scene.shops.length === 0) {
    return 0;
  }

  const averageAttraction =
    scene.shops.reduce((sum, shop) => sum + shop.attraction, 0) / scene.shops.length;
  const averageSpendingIntent =
    scene.bioAgentProfiles.length > 0
      ? scene.bioAgentProfiles.reduce(
          (sum, profile) => sum + profile.spendingIntent,
          0,
        ) / scene.bioAgentProfiles.length
      : 0.35;

  return clampPercent(
    18 +
      averageAttraction * 24 +
      averageSpendingIntent * 32 +
      (storeAttractionMultiplier - 1) * 20 -
      congestionIndexPercent * 0.12,
  );
}

function createSalesForecastCards(
  scene: CrowdSimScene,
  storeAttractionMultiplier: number,
  congestionIndexPercent: number,
) {
  return scene.shops
    .slice()
    .sort((left, right) => right.attraction - left.attraction)
    .slice(0, 4)
    .map((shop) => {
      const conversion = clampPercent(
        shop.conversionRate * 100 +
          shop.attraction * 16 +
          (shop.brand?.promotion ?? 0) * 18 +
          (storeAttractionMultiplier - 1) * 12 -
          congestionIndexPercent * 0.08,
      );

      return {
        forecastRevenueIndex: clampPercent(
          conversion * 0.6 + shop.capacity * 1.4 + shop.attraction * 12,
        ),
        id: shop.id,
        label: shop.name ?? shop.id,
        predictedConversionPercent: conversion,
      };
    });
}

function createTransitStopCards(scene: CrowdSimScene) {
  return scene.transitStops.map((stop) => {
    const delayMinutes = (stop.arrivalIntervalSeconds * stop.delayFactor) / 60;
    const capacityPressure = Math.min(45, stop.capacity / 4);
    const delayPressure = Math.max(0, stop.delayFactor - 1) * 55;
    const servicePressure = Math.max(0, 35 - stop.boardingCapacityPerMinute);

    return {
      id: stop.id,
      label: stop.name ?? stop.id,
      pressurePercent: clampPercent(capacityPressure + delayPressure + servicePressure),
      waitMinutes: round(delayMinutes),
    };
  });
}

function createBuildingPropertyCards(scene: CrowdSimScene) {
  return scene.buildings.slice(0, 4).map((building) => {
    const capacity =
      building.residentCapacity + building.workerCapacity + building.visitorCapacity;

    return {
      capacity,
      id: building.id,
      kind: building.kind,
      label: building.name ?? building.id,
      occupancySignalPercent: clampPercent(
        Math.min(100, capacity / Math.max(1, building.floors * 12)) +
          building.heightMeters * 0.8,
      ),
    };
  });
}

function createRiskExplanations(
  scene: CrowdSimScene,
  environmentImpact: ReturnType<typeof calculateEnvironmentImpact>,
) {
  const activeIds = new Set(environmentImpact.activeFactorIds);
  const activeHazards = scene.hazards.filter((hazard) =>
    activeIds.has(`hazard-${hazard.id}`),
  );

  if (activeHazards.length === 0 && environmentImpact.activeFactorIds.length === 0) {
    return ["No active weather or hazard risk is affecting movement."];
  }

  return [
    ...activeHazards.map(
      (hazard) =>
        `${hazard.name ?? hazard.id}: ${hazard.kind} severity ${Math.round(
          hazard.severity * 100,
        )}% near ${hazard.affectedRoadId ?? hazard.affectedZoneId ?? "open space"}`,
    ),
    `Speed ${round(environmentImpact.speedMultiplier)}x, route cost ${round(
      environmentImpact.routeCostMultiplier,
    )}x, visibility ${round(environmentImpact.visibilityMultiplier)}x`,
  ];
}

function createInsightLines(metrics: {
  commercialConversionForecastPercent: number;
  congestionIndexPercent: number;
  routeRiskIndexPercent: number;
  transitQueuePressurePercent: number;
}) {
  return [
    `Commercial conversion forecast ${metrics.commercialConversionForecastPercent}%`,
    `Congestion index ${metrics.congestionIndexPercent}%`,
    `Transit queue pressure ${metrics.transitQueuePressurePercent}%`,
    `Route risk index ${metrics.routeRiskIndexPercent}%`,
  ];
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function round(value: number) {
  return Number(value.toFixed(3));
}
