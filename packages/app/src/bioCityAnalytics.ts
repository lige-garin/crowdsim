import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { calculateEnvironmentImpact } from "./environmentEffects";
import type { HeatmapCell } from "./heatmap";
import { createBioCityViewportOverlayPlan } from "./bioCityViewportOverlayPlan";

export type BioCityAnalyticsSummary = {
  activeRiskCount: number;
  commercialConversionForecastPercent: number;
  congestionIndexPercent: number;
  heatmapPeak: {
    count: number;
    id: string;
    intensity: number;
  };
  insightLines: string[];
  routeRiskIndexPercent: number;
  topCorridors: Array<{
    id: string;
    intensity: number;
    risk: boolean;
    transitOnly: boolean;
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
    commercialConversionForecastPercent,
    congestionIndexPercent,
    heatmapPeak: {
      count: heatmapPeak.count,
      id: heatmapPeak.id,
      intensity: round(heatmapPeak.intensity),
    },
    insightLines: createInsightLines({
      commercialConversionForecastPercent,
      congestionIndexPercent,
      routeRiskIndexPercent,
      transitQueuePressurePercent,
    }),
    routeRiskIndexPercent,
    topCorridors,
    transitQueuePressurePercent,
    weatherImpact: {
      activeFactorIds: environmentImpact.activeFactorIds,
      routeCostMultiplier: round(environmentImpact.routeCostMultiplier),
      speedMultiplier: round(environmentImpact.speedMultiplier),
      visibilityMultiplier: round(environmentImpact.visibilityMultiplier),
    },
  };
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
