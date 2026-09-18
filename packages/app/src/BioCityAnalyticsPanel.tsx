import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { useMemo } from "react";
import { createBioCityAnalyticsSummary } from "./bioCityAnalytics";
import type { HeatmapCell } from "./heatmap";
import { useI18n, type Language } from "./i18n";

const copy: Record<Language, Record<string, string>> = {
  en: {
    buildings: "Buildings / stops",
    congestion: "Congestion est.",
    conversion: "Conversion est.",
    corridors: "Road capacity (design value)",
    eyebrow: "Scenario estimate",
    lede: "Computed from scene parameters and the live heatmap, not measured sales.",
    metrics: "Scene indicators",
    noTrails: "No trails yet",
    queue: "Queue pressure",
    region: "Scene analytics",
    revenueIndex: "Revenue index",
    risk: "Route risk",
    sales: "Retail est.",
    title: "Operations",
  },
  zh: {
    buildings: "建筑/站点",
    congestion: "拥堵估计",
    conversion: "转化估计",
    corridors: "道路容量（设计值）",
    eyebrow: "情景推演",
    lede: "基于当前场景参数与实时热力计算，非实测销售数据。",
    metrics: "场景指标",
    noTrails: "暂无轨迹",
    queue: "排队压力",
    region: "场景分析",
    revenueIndex: "营收指数",
    risk: "路径风险",
    sales: "商业估计",
    title: "运营态势",
  },
};

export function BioCityAnalyticsPanel({
  elapsedSeconds,
  heatmapCells,
  scene,
}: {
  elapsedSeconds: number;
  heatmapCells: readonly HeatmapCell[];
  scene: CrowdSimScene;
}) {
  const { language } = useI18n();
  const text = copy[language];
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
      aria-label={text.region}
    >
      <div className="biocity-analytics-heading">
        <p className="eyebrow">{text.eyebrow}</p>
        <h2>{text.title}</h2>
        <p>{text.lede}</p>
      </div>
      <div className="dashboard-metrics" aria-label={text.metrics}>
        <Metric label={text.congestion} value={`${summary.congestionIndexPercent}%`} />
        <Metric label={text.risk} value={`${summary.routeRiskIndexPercent}%`} />
        <Metric label={text.queue} value={`${summary.transitQueuePressurePercent}%`} />
        <Metric
          label={text.conversion}
          value={`${summary.commercialConversionForecastPercent}%`}
        />
      </div>
      <section className="biocity-compact-list" aria-label={text.corridors}>
        <h3>{text.corridors}</h3>
        {(summary.topCorridors.length > 0 ? summary.topCorridors.slice(0, 3) : []).map(
          (corridor, index) => (
            <article key={corridor.id}>
              <span>{index + 1}</span>
              <strong>{corridor.label}</strong>
              <em>{Math.round(corridor.intensity * 100)}%</em>
            </article>
          ),
        )}
        {summary.topCorridors.length === 0 ? <code>{text.noTrails}</code> : null}
      </section>
      <section className="biocity-compact-list" aria-label={text.sales}>
        <h3>{text.sales}</h3>
        {summary.salesForecastCards.slice(0, 2).map((shop) => (
          <article key={shop.id}>
            <span>{shop.predictedConversionPercent}%</span>
            <strong>{shop.label}</strong>
            {/*
              A 0–100 index from capacity, attraction and conversion. It was
              printed with a yen sign, which read as a revenue amount.
            */}
            <em title={text.revenueIndex}>{shop.forecastRevenueIndex}</em>
          </article>
        ))}
      </section>
      <section className="biocity-compact-list" aria-label={text.buildings}>
        <h3>{text.buildings}</h3>
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
