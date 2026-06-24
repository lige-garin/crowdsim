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
    <section
      className="dashboard-v2-panel biocity-analytics-compact"
      aria-label="BioCity analytics"
    >
      <div>
        <p className="eyebrow">实时分析</p>
        <h2>运营态势</h2>
      </div>
      <div className="dashboard-metrics" aria-label="BioCity analytics metrics">
        <Metric label="拥堵" value={`${summary.congestionIndexPercent}%`} />
        <Metric label="风险" value={`${summary.routeRiskIndexPercent}%`} />
        <Metric label="排队" value={`${summary.transitQueuePressurePercent}%`} />
        <Metric
          label="转化(预测)"
          value={`${summary.commercialConversionForecastPercent}%`}
        />
      </div>
      <section className="biocity-compact-list" aria-label="主要动线">
        <h3>主要动线</h3>
        {(summary.topCorridors.length > 0 ? summary.topCorridors.slice(0, 3) : []).map(
          (corridor, index) => (
            <article key={corridor.id}>
              <span>{index + 1}</span>
              <strong>{corridor.label}</strong>
              <em>{Math.round(corridor.intensity * 100)}%</em>
            </article>
          ),
        )}
        {summary.topCorridors.length === 0 ? <code>暂无轨迹</code> : null}
      </section>
      <section className="biocity-compact-list" aria-label="商业预测">
        <h3>商业预测</h3>
        {summary.salesForecastCards.slice(0, 2).map((shop) => (
          <article key={shop.id}>
            <span>{shop.predictedConversionPercent}%</span>
            <strong>{shop.label}</strong>
            <em>¥{shop.forecastRevenueIndex}</em>
          </article>
        ))}
      </section>
      <section className="biocity-compact-list" aria-label="建筑属性">
        <h3>建筑/站点</h3>
        {summary.buildingPropertyCards.slice(0, 1).map((building) => (
          <article key={building.id}>
            <span>{building.occupancySignalPercent}%</span>
            <strong>{building.label}</strong>
            <em>{building.capacity}</em>
          </article>
        ))}
        {summary.transitStopCards.slice(0, 1).map((stop) => (
          <article key={stop.id}>
            <span>{stop.pressurePercent}%</span>
            <strong>{stop.label}</strong>
            <em>{stop.waitMinutes}m</em>
          </article>
        ))}
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
