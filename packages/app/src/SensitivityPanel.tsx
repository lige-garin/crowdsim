import { useCallback, useEffect, useRef, useState } from "react";
import { rimeaCoreScenarios } from "./benchmarkScenarios";
import type { ExperimentQueueProgress } from "./experimentQueue";
import type { ExperimentRunResult } from "./experimentRunner";
import {
  buildMorrisExperiment,
  summarizeMorrisExperimentResults,
  type MorrisSummary,
  type MorrisTrajectory,
} from "./sensitivityAnalysis";
import {
  runExperimentInBackgroundWorker,
  type ExperimentWorkerLike,
} from "./experimentWorkerClient";
import { useI18n } from "./i18n";

/**
 * Morris (1991) elementary-effects screening (see `sensitivityAnalysis.ts`'s
 * own doc comment for the method and what it is not — a verification asset
 * over existing, already-live parameters, not a boundary change, so this
 * did not get its own ADR): which of the social-force model's own fitted
 * constants moves a scenario's throughput the most, off the main thread the
 * same way `ExperimentSweepPanel` runs a sweep — each trajectory point is
 * one real simulation run, and the default screening here alone is dozens
 * of them.
 *
 * A screening, not a full sensitivity study: it ranks parameters by how
 * much they move the metric, not by how much of its variance each one
 * explains (that is Sobol indices, a different and much more expensive
 * method, not built here).
 */

const defaultTrajectoryCount = 6;

type SensitivityState =
  | { kind: "idle" }
  | { kind: "running"; progress: ExperimentQueueProgress | null }
  | { kind: "done"; summary: MorrisSummary[] }
  | { kind: "failed"; message: string };

export function SensitivityPanel({
  workerFactory,
}: {
  /** Injected by tests; the app uses the real worker. */
  workerFactory?: (() => ExperimentWorkerLike) | null;
} = {}) {
  const { language } = useI18n();
  const [state, setState] = useState<SensitivityState>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const trajectoriesRef = useRef<MorrisTrajectory[]>([]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ kind: "running", progress: null });

    const { experiment, trajectories } = buildMorrisExperiment(
      rimeaCoreScenarios[0],
      undefined,
      { seed: 1, trajectoryCount: defaultTrajectoryCount },
    );
    trajectoriesRef.current = trajectories;

    runExperimentInBackgroundWorker(experiment, {
      onProgress: (progress) => setState({ kind: "running", progress }),
      signal: controller.signal,
      workerFactory,
    })
      .then((results: ExperimentRunResult[]) => {
        setState({
          kind: "done",
          summary: summarizeMorrisExperimentResults(trajectoriesRef.current, results),
        });
      })
      .catch((error: unknown) => {
        setState({
          kind: "failed",
          message: error instanceof Error ? error.message : "Screening failed",
        });
      });
  }, [workerFactory]);

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const zh = language === "zh";
  const title = zh
    ? "参数敏感性（Morris 筛选）"
    : "Parameter sensitivity (Morris screening)";

  return (
    <section className="probe-panel" aria-label={title}>
      <h3>{title}</h3>
      <p>
        {zh
          ? `社会力模型自身的拟合常数，哪几个对吞吐量影响最大——Morris 逐一改变法（elementary effects），${defaultTrajectoryCount} 条轨迹，在后台线程跑。只排名，不分解方差占比（那是 Sobol 指数，本项目未建）。`
          : `Which of the social-force model's own fitted constants moves throughput the most — Morris elementary-effects screening, ${defaultTrajectoryCount} trajectories, in a background worker. Ranks by effect, does not decompose variance share (that is Sobol indices, not built here).`}
      </p>
      {state.kind === "running" ? (
        <button type="button" data-testid="sensitivity-stop" onClick={stop}>
          {zh ? "停止" : "Stop"}
        </button>
      ) : (
        <button type="button" data-testid="sensitivity-run" onClick={run}>
          {zh ? "开始筛选" : "Run screening"}
        </button>
      )}
      {state.kind === "running" ? (
        <code data-testid="sensitivity-progress">
          {zh ? "进行中" : "running"} {state.progress?.completed ?? 0}/
          {state.progress?.total ?? "?"}
        </code>
      ) : null}
      {state.kind === "failed" ? (
        <code data-testid="sensitivity-error">{state.message}</code>
      ) : null}
      {state.kind === "done" ? (
        <ol className="sensitivity-ranking">
          {state.summary.map((entry, index) => (
            <li key={entry.parameterId} data-testid={`sensitivity-rank-${index}`}>
              {entry.parameterId}: μ*={entry.meanAbsoluteEffect.toFixed(3)}, σ=
              {entry.stdDevEffect.toFixed(3)}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
