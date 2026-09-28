import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { CountLineFlowChart } from "../charts/CountLineFlowChart";
import type { DashboardSample } from "../analytics/dashboardStats";
import { FruinLosGauge } from "../charts/FruinLosGauge";
import { fruinColours, fruinLevels } from "../analytics/fruinLevelOfService";
import type { Language } from "../i18n";
import { JourneyTimeHistogram } from "../charts/JourneyTimeHistogram";
import { PlacesRankingChart } from "../charts/PlacesRankingChart";
import { QueueLengthSparkline } from "../charts/QueueLengthSparkline";
import { RealtimeStrip } from "../charts/RealtimeStrip";
import type {
  MinuteFlow,
  RunAnalytics,
  RunAnalyticsSummary,
  StayKind,
} from "../analytics/runAnalytics";

export type RunAnalyticsExport = keyof RunAnalytics["csv"];

const exportsInOrder: readonly RunAnalyticsExport[] = [
  "flows",
  "journeys",
  "stays",
  "levelOfService",
  "densityCells",
];

const copy = {
  en: {
    backward: "←",
    empty: "Nothing measured yet: the run records once a simulated second.",
    export: "Export CSV",
    exports: {
      densityCells: "Density grid",
      flows: "Line flows",
      journeys: "Journeys",
      levelOfService: "LOS over time",
      stays: "Stays & waits",
    },
    forward: "→",
    journeys: "Journey time",
    kinds: {
      browse: "Browse",
      counterQueue: "Till queue",
      service: "At till",
      shopQueue: "Shop queue",
    } satisfies Record<StayKind, string>,
    lines: "Count lines",
    los: "Level of service (Fruin, walkway)",
    noLines: "No count lines in this scene. Add one from the Flow tools.",
    peak: "Peak",
    peakLine: "peak/min",
    places: "Stays and waits",
    region: "Measured results",
    singleRun:
      "One run of this scene, with one seed: these are measurements, not estimates with an interval. For a range, repeat the run in Parameter sweep.",
    share: "D or worse, whole run",
    title: "Measured",
    visits: "visits",
  },
  zh: {
    backward: "←",
    empty: "尚无数据：运行中每个仿真秒记录一次。",
    export: "导出 CSV",
    exports: {
      densityCells: "密度网格",
      flows: "计数线流量",
      journeys: "行程",
      levelOfService: "服务水平时序",
      stays: "停留与等待",
    },
    forward: "→",
    journeys: "行程时间",
    kinds: {
      browse: "浏览",
      counterQueue: "收银排队",
      service: "结账中",
      shopQueue: "店外排队",
    } satisfies Record<StayKind, string>,
    lines: "计数线",
    los: "服务水平（Fruin，通道）",
    noLines: "场景里没有计数线，可在建造栏「人流」类中添加。",
    peak: "峰值",
    peakLine: "峰值/分",
    places: "停留与等待",
    region: "实测指标",
    singleRun:
      "本页是这一次运行（单一种子）的实测值，不带置信区间。要区间请在「参数扫描」里重复运行。",
    share: "D 级及更差（全程）",
    title: "实测",
    visits: "人次",
  },
};

/**
 * What this run actually measured, as opposed to the scenario estimates in the
 * operations panel: Fruin level of service, count-line flows, journey times and
 * waits, each exportable as CSV for a report or a spreadsheet.
 */
export function RunAnalyticsPanel({
  dashboardSamples,
  journeyDurations,
  language,
  minuteFlows,
  onExport,
  placeOccupancyOverTime,
  scene,
  summary,
}: {
  dashboardSamples: readonly DashboardSample[];
  journeyDurations: () => number[];
  language: Language;
  minuteFlows: () => MinuteFlow[];
  onExport: (kind: RunAnalyticsExport) => void;
  placeOccupancyOverTime: (
    kind: StayKind,
    placeId: string,
  ) => { t: number; count: number }[];
  scene: CrowdSimScene;
  summary: RunAnalyticsSummary;
}) {
  const text = copy[language];
  const seconds = (value: number) => `${Math.round(value)} s`;
  const { levelOfService: los } = summary;
  const occupied = fruinLevels.reduce((total, level) => total + los.current[level], 0);
  const placeName = (id: string) =>
    scene.shops.find((shop) => shop.id === id)?.name ??
    scene.servicePoints.find((point) => point.id === id)?.name ??
    id;
  const places = [...summary.places].sort((a, b) => b.visits - a.visits).slice(0, 8);
  // Not memoized: `minuteFlows` (from useRunSeries.ts) is a fresh closure on
  // every render, so a useMemo keyed on it would never actually skip this --
  // it would just add a Map allocation and a dependency check on top of the
  // same per-render grouping this does directly.
  const flowsByLine = new Map<string, MinuteFlow[]>();
  for (const flow of minuteFlows()) {
    const bucket = flowsByLine.get(flow.id);
    if (bucket) bucket.push(flow);
    else flowsByLine.set(flow.id, [flow]);
  }

  return (
    <section className="compact-panel run-analytics" aria-label={text.region}>
      <header>
        <span>{text.title}</span>
        <strong>{seconds(summary.elapsedSeconds)}</strong>
      </header>

      <RealtimeStrip language={language} samples={dashboardSamples} />

      <p className="run-analytics-single-run" data-testid="run-analytics-single-run">
        {text.singleRun}
      </p>

      {summary.samples === 0 ? (
        <p className="run-analytics-empty">{text.empty}</p>
      ) : (
        <>
          <h4>{text.los}</h4>
          <div className="los-bar" role="img" aria-label={text.los}>
            {fruinLevels.map((level) =>
              los.current[level] > 0 ? (
                <span
                  key={level}
                  style={{
                    background: fruinColours[level],
                    flexGrow: los.current[level],
                  }}
                  title={`${level}: ${los.current[level]}`}
                >
                  {level}
                </span>
              ) : null,
            )}
            {occupied === 0 ? <span className="los-bar-empty">–</span> : null}
          </div>
          <FruinLosGauge peakDensity={los.peakDensity} peakLevel={los.peakLevel} />
          <div className="status-list">
            <div>
              <span>{text.peak}</span>
              <strong>
                {los.peakDensity.toFixed(2)} P/m² · {los.peakLevel}
              </strong>
            </div>
            <div>
              <span>{text.share}</span>
              <strong>{Math.round(los.shareDOrWorse * 100)}%</strong>
            </div>
          </div>

          <h4>{text.lines}</h4>
          {summary.flows.length === 0 ? (
            <p className="run-analytics-empty">{text.noLines}</p>
          ) : (
            <div className="status-list run-analytics-lines">
              {summary.flows.map((flow) => (
                <div key={flow.id} data-testid={`count-line-${flow.id}`}>
                  <span>{flow.name}</span>
                  <strong>
                    {text.forward} {flow.forward} · {text.backward} {flow.backward} ·{" "}
                    {flow.peakPerMinute} {text.peakLine}
                  </strong>
                  <CountLineFlowChart
                    flows={flowsByLine.get(flow.id) ?? []}
                    language={language}
                    name={flow.name}
                  />
                </div>
              ))}
            </div>
          )}

          <h4>{text.journeys}</h4>
          <div className="status-list">
            <div>
              <span>n = {summary.journeys.count}</span>
              <strong>
                P50 {seconds(summary.journeys.p50Seconds)} · P90{" "}
                {seconds(summary.journeys.p90Seconds)}
              </strong>
            </div>
          </div>
          {summary.journeys.count > 0 ? (
            <JourneyTimeHistogram
              durations={journeyDurations()}
              language={language}
              p50Seconds={summary.journeys.p50Seconds}
              p90Seconds={summary.journeys.p90Seconds}
            />
          ) : null}

          {places.length > 0 ? (
            <>
              <h4>{text.places}</h4>
              <PlacesRankingChart
                language={language}
                places={places.map((place) => ({
                  label: `${text.kinds[place.kind]} · ${placeName(place.placeId)}`,
                  visits: place.visits,
                }))}
              />
              <div className="status-list run-analytics-places">
                {places.map((place) => {
                  const isQueue =
                    place.kind === "shopQueue" || place.kind === "counterQueue";
                  return (
                    <div key={`${place.kind}:${place.placeId}`}>
                      <span>
                        {text.kinds[place.kind]} · {placeName(place.placeId)}
                      </span>
                      <strong>
                        {place.visits} {text.visits} · P50 {seconds(place.p50Seconds)} ·
                        P90 {seconds(place.p90Seconds)} · max {place.peakConcurrent}
                      </strong>
                      {isQueue ? (
                        <QueueLengthSparkline
                          series={placeOccupancyOverTime(place.kind, place.placeId)}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </>
      )}

      <h4>{text.export}</h4>
      <div className="run-analytics-exports">
        {exportsInOrder.map((kind) => (
          <button
            key={kind}
            type="button"
            data-testid={`export-${kind}`}
            disabled={summary.samples === 0}
            onClick={() => onExport(kind)}
          >
            {text.exports[kind]}
          </button>
        ))}
      </div>
    </section>
  );
}
