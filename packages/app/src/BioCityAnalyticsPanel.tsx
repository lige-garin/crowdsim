import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { useMemo, type ReactNode } from "react";
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
          .map((corridor) => `${corridor.label}${corridor.risk ? ":risk" : ""}`)
          .join(" | ") || "none"}
      </code>
      <section
        className="biocity-analytics-grid"
        aria-label="BioCity detailed analytics"
      >
        <MiniPanel title="Heatmap trend">
          {summary.heatmapTrend.length > 0 ? (
            summary.heatmapTrend.map((cell) => (
              <MeterLine key={cell.id} label={cell.id} value={cell.intensityPercent} />
            ))
          ) : (
            <code>No heatmap samples</code>
          )}
        </MiniPanel>
        <MiniPanel title="Sales forecast">
          {summary.salesForecastCards.map((shop) => (
            <code key={shop.id}>
              {shop.label} | conversion {shop.predictedConversionPercent}% | revenue{" "}
              {shop.forecastRevenueIndex}
            </code>
          ))}
        </MiniPanel>
        <MiniPanel title="Main corridors">
          {summary.topCorridors.map((corridor) => (
            <code key={corridor.id}>
              {corridor.label} | intensity {Math.round(corridor.intensity * 100)}% |{" "}
              {corridor.transitOnly ? "transit" : "mixed"}
              {corridor.risk ? " | risk" : ""}
            </code>
          ))}
        </MiniPanel>
        <MiniPanel title="Building attributes">
          {summary.buildingPropertyCards.map((building) => (
            <code key={building.id}>
              {building.label} | {building.kind} | cap {building.capacity} | occupancy{" "}
              {building.occupancySignalPercent}%
            </code>
          ))}
        </MiniPanel>
        <MiniPanel title="Transit queues">
          {summary.transitStopCards.length > 0 ? (
            summary.transitStopCards.map((stop) => (
              <code key={stop.id}>
                {stop.label} | wait {stop.waitMinutes}m | pressure{" "}
                {stop.pressurePercent}%
              </code>
            ))
          ) : (
            <code>No active transit stops</code>
          )}
        </MiniPanel>
        <MiniPanel title="Risk explanation">
          {summary.riskExplanations.map((line) => (
            <code key={line}>{line}</code>
          ))}
        </MiniPanel>
      </section>
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

function MiniPanel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <article className="biocity-analytics-card">
      <span>{title}</span>
      {children}
    </article>
  );
}

function MeterLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="biocity-meter-line">
      <span>{label}</span>
      <meter min="0" max="100" value={value} />
      <code>{value}%</code>
    </div>
  );
}
