import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { createBioCityAnalyticsSummary } from "./bioCityAnalytics";
import type { HeatmapCell } from "./heatmap";

export type BioCityAnalyticsAcceptanceItem = {
  blocksCompletion: boolean;
  completionPercent: number;
  evidence: string[];
  id:
    | "building-property-cards"
    | "congestion-risk-metrics"
    | "heatmap-trend"
    | "main-corridors"
    | "sales-forecast"
    | "transit-queues";
  status: "complete" | "partial";
};

export type BioCityAnalyticsAcceptanceAudit = {
  blocksCompletion: boolean;
  completeCount: number;
  completionPercent: number;
  itemCount: number;
  remainingBlockers: string[];
};

export function createBioCityAnalyticsAcceptanceReport(options: {
  elapsedSeconds: number;
  heatmapCells: readonly HeatmapCell[];
  scene: CrowdSimScene;
}): BioCityAnalyticsAcceptanceItem[] {
  const summary = createBioCityAnalyticsSummary(options);

  return [
    createItem({
      complete: summary.heatmapTrend.length > 0 && summary.heatmapPeak.intensity > 0,
      evidence: [
        `heatmapTrend=${summary.heatmapTrend.length}`,
        `peak=${summary.heatmapPeak.id}`,
        `peakIntensity=${summary.heatmapPeak.intensity}`,
      ],
      id: "heatmap-trend",
    }),
    createItem({
      complete: summary.congestionIndexPercent > 0 && summary.routeRiskIndexPercent > 0,
      evidence: [
        `congestion=${summary.congestionIndexPercent}%`,
        `routeRisk=${summary.routeRiskIndexPercent}%`,
        `riskExplanations=${summary.riskExplanations.length}`,
      ],
      id: "congestion-risk-metrics",
    }),
    createItem({
      complete:
        summary.salesForecastCards.length > 0 &&
        summary.salesForecastCards.every((card) => card.predictedConversionPercent > 0),
      evidence: [
        `salesCards=${summary.salesForecastCards.length}`,
        `top=${summary.salesForecastCards[0]?.label ?? "none"}`,
        `conversion=${summary.salesForecastCards[0]?.predictedConversionPercent ?? 0}%`,
      ],
      id: "sales-forecast",
    }),
    createItem({
      complete:
        summary.topCorridors.length > 0 &&
        summary.topCorridors.some((corridor) => corridor.risk),
      evidence: [
        `corridors=${summary.topCorridors.length}`,
        `riskCorridors=${summary.topCorridors.filter((corridor) => corridor.risk).length}`,
        `transitCorridors=${summary.topCorridors.filter((corridor) => corridor.transitOnly).length}`,
      ],
      id: "main-corridors",
    }),
    createItem({
      complete:
        summary.buildingPropertyCards.length > 0 &&
        summary.buildingPropertyCards.every((card) => card.capacity >= 0),
      evidence: [
        `buildingCards=${summary.buildingPropertyCards.length}`,
        `first=${summary.buildingPropertyCards[0]?.label ?? "none"}`,
        `occupancy=${summary.buildingPropertyCards[0]?.occupancySignalPercent ?? 0}%`,
      ],
      id: "building-property-cards",
    }),
    createItem({
      complete:
        summary.transitStopCards.length > 0 && summary.transitQueuePressurePercent > 0,
      evidence: [
        `transitCards=${summary.transitStopCards.length}`,
        `queuePressure=${summary.transitQueuePressurePercent}%`,
        `wait=${summary.transitStopCards[0]?.waitMinutes ?? 0}m`,
      ],
      id: "transit-queues",
    }),
  ];
}

export function createBioCityAnalyticsAcceptanceAudit(
  report: readonly BioCityAnalyticsAcceptanceItem[],
): BioCityAnalyticsAcceptanceAudit {
  const completeCount = report.filter((item) => item.status === "complete").length;
  const remainingBlockers = report
    .filter((item) => item.blocksCompletion || item.status !== "complete")
    .map((item) => item.id);

  return {
    blocksCompletion: remainingBlockers.length > 0,
    completeCount,
    completionPercent:
      report.length > 0
        ? Math.round(
            report.reduce((sum, item) => sum + item.completionPercent, 0) /
              report.length,
          )
        : 0,
    itemCount: report.length,
    remainingBlockers,
  };
}

function createItem({
  complete,
  evidence,
  id,
}: {
  complete: boolean;
  evidence: string[];
  id: BioCityAnalyticsAcceptanceItem["id"];
}): BioCityAnalyticsAcceptanceItem {
  return {
    blocksCompletion: !complete,
    completionPercent: complete ? 100 : 60,
    evidence,
    id,
    status: complete ? "complete" : "partial",
  };
}
