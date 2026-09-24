import { useCallback, useEffect, useRef, useState } from "react";
import { rimeaCoreScenarios } from "./benchmarkScenarios";
import type { ExperimentQueueProgress } from "./experimentQueue";
import type { ExperimentRunResult } from "./experimentRunner";
import { ExperimentSweepErrorBarChart } from "./ExperimentSweepErrorBarChart";
import {
  createExperimentFromSweep,
  summarizeMonteCarloDistribution,
  type MetricDistribution,
} from "./experimentSweep";
import {
  runExperimentInBackgroundWorker,
  type ExperimentWorkerLike,
} from "./experimentWorkerClient";
import { useI18n } from "./i18n";

/**
 * Repeat runs of a parameter sweep, off the main thread.
 *
 * This panel used to call `runExperiment` synchronously while the app froze,
 * and print the worker request it never sent as a label. It now runs the
 * experiment in the background worker that was written for it, reports
 * progress, and can be stopped.
 *
 * Every number it shows comes with how many runs are behind it, and an
 * interval only when there is more than one — see `bootstrapMeanInterval`.
 */

/**
 * Runs per variant. Five is the smallest number that gives a bootstrap
 * interval worth printing here, and it keeps a sweep of three variants to
 * fifteen headless runs — a few seconds. It is a starting point for a look,
 * not a defensible sample size for a report: widen it until the interval is
 * narrow enough for the decision being made.
 */
const defaultReplications = 5;

type SweepState =
  | { kind: "idle" }
  | { kind: "running"; progress: ExperimentQueueProgress | null }
  | { kind: "done"; distribution: Record<string, MetricDistribution> }
  | { kind: "failed"; message: string };

export function ExperimentSweepPanel({
  workerFactory,
}: {
  /** Injected by tests; the app uses the real worker. */
  workerFactory?: (() => ExperimentWorkerLike) | null;
} = {}) {
  const { language } = useI18n();
  const [state, setState] = useState<SweepState>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ kind: "running", progress: null });

    const experiment = createExperimentFromSweep({
      id: "exit-width-sweep",
      name: "Exit width sweep",
      parameter: {
        end: 4,
        kind: "entrance-width",
        start: 2,
        step: 1,
        targetEntranceId: "east-sink",
      },
      replications: defaultReplications,
      scenario: rimeaCoreScenarios[0],
    });

    runExperimentInBackgroundWorker(experiment, {
      onProgress: (progress) => setState({ kind: "running", progress }),
      signal: controller.signal,
      workerFactory,
    })
      .then((results: ExperimentRunResult[]) => {
        setState({
          kind: "done",
          distribution: summarizeMonteCarloDistribution(results),
        });
      })
      .catch((error: unknown) => {
        setState({
          kind: "failed",
          message: error instanceof Error ? error.message : "Sweep failed",
        });
      });
  }, [workerFactory]);

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const zh = language === "zh";
  const title = zh ? "参数扫描" : "Parameter sweep";

  return (
    <section className="probe-panel" aria-label={title}>
      <h3>{title}</h3>
      <p>
        {zh
          ? `出口宽度扫描，每个方案重复 ${defaultReplications} 次，在后台线程跑。`
          : `Exit-width sweep, ${defaultReplications} runs per variant, in a background worker.`}
      </p>
      {state.kind === "running" ? (
        <button type="button" data-testid="sweep-stop" onClick={stop}>
          {zh ? "停止" : "Stop"}
        </button>
      ) : (
        <button type="button" data-testid="sweep-run" onClick={run}>
          {zh ? "开始扫描" : "Run sweep"}
        </button>
      )}
      {state.kind === "running" ? (
        <code data-testid="sweep-progress">
          {zh ? "进行中" : "running"} {state.progress?.completed ?? 0}/
          {state.progress?.total ?? "?"}
        </code>
      ) : null}
      {state.kind === "failed" ? (
        <code data-testid="sweep-error">{state.message}</code>
      ) : null}
      {state.kind === "done" ? (
        <>
          <ExperimentSweepErrorBarChart
            distribution={state.distribution}
            language={zh ? "zh" : "en"}
          />
          {Object.entries(state.distribution).map(([variantId, metric]) => (
            <code key={variantId} data-testid={`sweep-result-${variantId}`}>
              {variantId} | {zh ? "均值" : "mean"} {metric.mean}{" "}
              {formatInterval(metric, zh)}
            </code>
          ))}
        </>
      ) : null}
    </section>
  );
}

/**
 * The interval, or a plain statement that there is none. A single run prints
 * "1 run, no interval" rather than a bare number that reads as exact.
 */
function formatInterval(metric: MetricDistribution, zh: boolean) {
  if (!metric.ci95) {
    return zh
      ? `（${metric.runs} 次运行，无区间）`
      : `(${metric.runs} run, no interval)`;
  }

  return zh
    ? `[95% ${metric.ci95.low}–${metric.ci95.high}]，${metric.runs} 次`
    : `[95% CI ${metric.ci95.low}–${metric.ci95.high}], n=${metric.runs}`;
}
