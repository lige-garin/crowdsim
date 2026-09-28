import { useCallback, useState } from "react";
import { ScenarioDiffMetricChart } from "../charts/ScenarioDiffMetricChart";
import { useI18n } from "../i18n";
import {
  buildScenarioDiffReport,
  renderScenarioDiffReportHtml,
} from "../analytics/scenarioDiffReport";
import type { ScenarioDiffReport } from "../analytics/scenarioDiffReport";
import {
  runScenarioDiffInWorker,
  scenarioDiffScenarioOptions,
  type ScenarioDiffWorkerLike,
} from "../analytics/scenarioDiffWorkerClient";

/**
 * Runs two of the built-in scenarios side by side and opens a printable diff
 * report — the orchestration `scenarioDiffReport.ts`'s own doc comment named
 * as "not attempted here": a real scenario A and a real scenario B, each
 * actually simulated, not the M6 `ScenarioComparisonPanel`'s single hardcoded
 * scene with parameter variants ranked by one throughput number.
 *
 * The scenario pool is `rimeaCoreScenarios` (straight corridor, bottleneck,
 * corner, counterflow) — the same fixture set `ExperimentSweepPanel` and
 * `RimeaReportPanel` already run, real structurally-different scenes rather
 * than the user's own open project (there is exactly one of those at a
 * time, nothing to diff it against).
 */

type DiffState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; report: ScenarioDiffReport }
  | { kind: "failed"; message: string };

export function ScenarioDiffPanel({
  workerFactory,
}: {
  /** Injected by tests; the app uses the real worker. */
  workerFactory?: () => ScenarioDiffWorkerLike;
} = {}) {
  const { language } = useI18n();
  const zh = language === "zh";
  const options = scenarioDiffScenarioOptions;
  const [scenarioAId, setScenarioAId] = useState(options[0]?.id ?? "");
  const [scenarioBId, setScenarioBId] = useState(
    options[1]?.id ?? options[0]?.id ?? "",
  );
  const [evacuate, setEvacuate] = useState(false);
  const [state, setState] = useState<DiffState>({ kind: "idle" });

  const run = useCallback(() => {
    setState({ kind: "running" });
    runScenarioDiffInWorker({ evacuate, scenarioAId, scenarioBId }, { workerFactory })
      .then(({ scenarioA, scenarioB }) => {
        setState({
          kind: "done",
          report: buildScenarioDiffReport(scenarioA, scenarioB),
        });
      })
      .catch((error: unknown) => {
        setState({
          kind: "failed",
          message: error instanceof Error ? error.message : "Scenario diff failed",
        });
      });
  }, [evacuate, scenarioAId, scenarioBId, workerFactory]);

  function openReport(report: ScenarioDiffReport) {
    const html = renderScenarioDiffReportHtml(report, zh ? "zh" : "en");
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  const title = zh ? "情景对比报告" : "Scenario diff report";
  const running = state.kind === "running";

  return (
    <section className="probe-panel" aria-label={title}>
      <h3>{title}</h3>
      <p>
        {zh
          ? "真实运行两个内置场景并比较服务水平、行程时间、疏散清空时间与计数线流量。"
          : "Actually runs two built-in scenarios and compares level of service, journey times, evacuation clearance, and count-line flow."}
      </p>
      <label>
        {zh ? "场景 A" : "Scenario A"}
        <select
          data-testid="scenario-diff-a"
          value={scenarioAId}
          disabled={running}
          onChange={(event) => setScenarioAId(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {zh ? "场景 B" : "Scenario B"}
        <select
          data-testid="scenario-diff-b"
          value={scenarioBId}
          disabled={running}
          onChange={(event) => setScenarioBId(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          data-testid="scenario-diff-evacuate"
          checked={evacuate}
          disabled={running}
          onChange={(event) => setEvacuate(event.target.checked)}
        />
        {zh ? "两侧均触发疏散" : "Evacuate both sides"}
      </label>
      <button
        type="button"
        data-testid="scenario-diff-run"
        disabled={running}
        onClick={run}
      >
        {running ? (zh ? "运行中…" : "Running…") : zh ? "运行对比" : "Run comparison"}
      </button>
      {state.kind === "failed" ? (
        <code data-testid="scenario-diff-error">{state.message}</code>
      ) : null}
      {state.kind === "done" ? (
        <>
          <code data-testid="scenario-diff-summary">
            {state.report.scenarioA.name} vs {state.report.scenarioB.name} |{" "}
            {state.report.metrics.length} {zh ? "项指标" : "metrics"} |{" "}
            {state.report.flows.length} {zh ? "条计数线" : "flow lines"}
          </code>
          <div className="scenario-diff-metrics">
            {state.report.metrics.map((metric) => (
              <ScenarioDiffMetricChart
                key={metric.key}
                metric={metric}
                scenarioAName={state.report.scenarioA.name}
                scenarioBName={state.report.scenarioB.name}
              />
            ))}
          </div>
          <button
            type="button"
            data-testid="scenario-diff-open-report"
            onClick={() => openReport(state.report)}
          >
            {zh ? "打开报告" : "Open report"}
          </button>
        </>
      ) : null}
    </section>
  );
}
