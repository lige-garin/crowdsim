import type { DashboardV2Stats, QueueLengthPoint } from "./dashboardV2Stats";
import { useI18n } from "./i18n";

export function DashboardV2Panel({ stats }: { stats: DashboardV2Stats }) {
  const { t, text } = useI18n();

  return (
    <section className="dashboard-v2-panel" aria-label={t("dashboardV2")}>
      <div>
        <p className="eyebrow">{t("dashboardV2")}</p>
        <h2>{t("behaviorAnalytics")}</h2>
      </div>
      <div className="dashboard-metrics" aria-label={t("dashboardV2Metrics")}>
        <article className="dashboard-metric">
          <span>{t("shopEntry")}</span>
          <strong>{stats.shopEntryRatePercent}%</strong>
        </article>
        <article className="dashboard-metric">
          <span>{t("queuePeak")}</span>
          <strong>
            {Math.max(0, ...stats.queueLengthSeries.map((point) => point.queueLength))}
          </strong>
        </article>
        <article className="dashboard-metric">
          <span>{t("flow")}</span>
          <strong>{stats.crossSectionFlowPerMinute}/m</strong>
        </article>
        <article className="dashboard-metric">
          <span>{t("brandAttraction")}</span>
          <strong>{stats.brandAttractionPercent}%</strong>
        </article>
      </div>
      <svg
        className="dashboard-v2-chart"
        viewBox="0 0 120 42"
        role="img"
        aria-label={t("queueLengthCurve")}
      >
        <polyline points={queuePointsToSvg(stats.queueLengthSeries)} />
      </svg>
      <code className="dashboard-summary">{text(stats.summary)}</code>
      <code className="dashboard-summary">{text(stats.trajectoryReplay)}</code>
    </section>
  );
}

function queuePointsToSvg(points: readonly QueueLengthPoint[]) {
  if (points.length === 0) {
    return "";
  }

  const maxQueue = Math.max(1, ...points.map((point) => point.queueLength));

  return points
    .map((point, index) => {
      const x = points.length === 1 ? 0 : (index / (points.length - 1)) * 120;
      const y = 38 - (point.queueLength / maxQueue) * 34;

      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
