import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import type { DashboardStats } from "./dashboardStats";
import { translate, useI18n, type Language } from "./i18n";

echarts.use([GridComponent, LineChart, SVGRenderer, TooltipComponent]);

export function DashboardPanel({ stats }: { stats: DashboardStats }) {
  const { language, t, text } = useI18n();
  const chartRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef = useRef<ReturnType<typeof echarts.init> | null>(null);

  useEffect(() => {
    const element = chartRef.current;

    if (!element || typeof window === "undefined" || isJsdomRuntime()) {
      return;
    }

    const chartElement = element;

    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartElement, undefined, {
        height: 132,
        renderer: "svg",
        width: Math.max(220, chartElement.clientWidth || 220),
      });
    }

    const chart = chartInstanceRef.current;
    const data =
      stats.populationSeries.length > 0
        ? stats.populationSeries.map((point) => [
            Number(point.elapsedSeconds.toFixed(1)),
            point.agentCount,
          ])
        : [[0, stats.currentAgentCount]];

    chart.setOption(
      {
        animation: false,
        grid: {
          bottom: 26,
          left: 34,
          right: 10,
          top: 12,
        },
        series: [
          {
            data,
            lineStyle: {
              color: "#116c5f",
              width: 2,
            },
            showSymbol: false,
            smooth: true,
            type: "line",
          },
        ],
        tooltip: {
          trigger: "axis",
          valueFormatter: (value: number) => `${value} ${t("agentsUnit")}`,
        },
        xAxis: {
          axisLabel: {
            color: "#697066",
            formatter: "{value}s",
          },
          axisLine: {
            lineStyle: {
              color: "#ded8cb",
            },
          },
          splitLine: {
            show: false,
          },
          type: "value",
        },
        yAxis: {
          axisLabel: {
            color: "#697066",
          },
          axisLine: {
            lineStyle: {
              color: "#ded8cb",
            },
          },
          minInterval: 1,
          splitLine: {
            lineStyle: {
              color: "rgba(32, 35, 31, 0.08)",
            },
          },
          type: "value",
        },
      },
      true,
    );

    function resizeChart() {
      chart.resize({
        height: 132,
        width: Math.max(220, chartElement.clientWidth || 220),
      });
    }

    window.addEventListener("resize", resizeChart);
    resizeChart();

    return () => window.removeEventListener("resize", resizeChart);
  }, [stats, t]);

  useEffect(
    () => () => {
      chartInstanceRef.current?.dispose();
      chartInstanceRef.current = null;
    },
    [],
  );

  return (
    <section className="dashboard-panel" aria-label={t("dashboardV1")}>
      <div>
        <p className="eyebrow">{t("dashboard")}</p>
        <h2>{t("liveAnalytics")}</h2>
      </div>
      <div className="dashboard-metrics" aria-label={t("dashboardMetrics")}>
        <article className="dashboard-metric">
          <span>{t("agents")}</span>
          <strong>{stats.currentAgentCount}</strong>
        </article>
        <article className="dashboard-metric">
          <span>{t("peakDensity")}</span>
          <strong>{stats.densityPeak > 0 ? stats.densityPeak : "--"}</strong>
        </article>
        <article className="dashboard-metric">
          <span>{t("evacuationTime")}</span>
          <strong>{formatEvacuationTime(stats, language)}</strong>
        </article>
      </div>
      <div
        ref={chartRef}
        className="dashboard-chart"
        role="img"
        aria-label={t("populationCurve")}
      />
      <code className="dashboard-summary">{text(stats.summary)}</code>
    </section>
  );
}

function formatEvacuationTime(stats: DashboardStats, language: Language) {
  if (
    stats.evacuationStatus === "complete" &&
    stats.evacuationCompletionSeconds !== null
  ) {
    return formatSeconds(stats.evacuationCompletionSeconds);
  }

  if (stats.evacuationStatus === "running") {
    return `${formatSeconds(stats.evacuationElapsedSeconds ?? 0)} ${translate(
      language,
      "run",
    )}`;
  }

  return "--";
}

function formatSeconds(seconds: number) {
  return `${Math.max(0, Math.round(seconds))}s`;
}

function isJsdomRuntime() {
  return (
    typeof navigator !== "undefined" &&
    navigator.userAgent.toLowerCase().includes("jsdom")
  );
}
