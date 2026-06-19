import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { useMemo } from "react";
import { createBioCityAnalyticsSummary } from "./bioCityAnalytics";
import type { HeatmapCell } from "./heatmap";

export function BioCityAnalyticsPanel({
  elapsedSeconds,
  heatmapCells,
  scene,
}: {
  elapsedSeconds: number;
  heatmapCells: readonly HeatmapCell[];
  scene: CrowdSimScene;
}) {
  const summary = useMemo(
    () =>
      createBioCityAnalyticsSummary({
        elapsedSeconds,
        heatmapCells,
        scene,
      }),
    [elapsedSeconds, heatmapCells, scene],
  );

  return (
    <section className="dashboard-v2-panel" aria-label="BioCity analytics">
      <div>
        <p className="eyebrow">BioCity analytics</p>
        <h2>Operating intelligence</h2>
      </div>
      <div className="dashboard-metrics" aria-label="BioCity analytics metrics">
        <Metric label="Congestion" value={`${summary.congestionIndexPercent}%`} />
        <Metric label="Route risk" value={`${summary.routeRiskIndexPercent}%`} />
        <Metric
          label="Transit queue"
          value={`${summary.transitQueuePressurePercent}%`}
        />
        <Metric
          label="Conversion"
          value={`${summary.commercialConversionForecastPercent}%`}
        />
      </div>
      <code className="dashboard-summary">
        peak {summary.heatmapPeak.id} | count {summary.heatmapPeak.count} | risks{" "}
        {summary.activeRiskCount}
      </code>
      <code className="dashboard-summary">
        weather speed {summary.weatherImpact.speedMultiplier} | visibility{" "}
        {summary.weatherImpact.visibilityMultiplier} | route cost{" "}
        {summary.weatherImpact.routeCostMultiplier}
      </code>
      <code className="dashboard-summary">
        corridors{" "}
        {summary.topCorridors
          .map((corridor) => `${corridor.id}${corridor.risk ? ":risk" : ""}`)
          .join(" | ") || "none"}
      </code>
      {summary.insightLines.map((line) => (
        <code key={line} className="dashboard-summary">
          {line}
        </code>
      ))}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="dashboard-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
