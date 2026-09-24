import { useCallback, useEffect, useRef, useState } from "react";
import { rimeaCoreScenarios } from "./benchmarkScenarios";
import type { ExperimentQueueProgress } from "./experimentQueue";
import type { ExperimentRunResult } from "./experimentRunner";
import {
  buildMorrisExperiment,
  defaultSocialForceScreeningParameters,
  summarizeMorrisExperimentResults,
  type MorrisSummary,
  type MorrisTrajectory,
} from "./sensitivityAnalysis";
import {
  buildSobolExperiment,
  summarizeSobolExperimentResults,
  type SobolSampleMatrices,
  type SobolSummary,
} from "./sobolAnalysis";
import {
  runExperimentInBackgroundWorker,
  type ExperimentWorkerLike,
} from "./experimentWorkerClient";
import { SensitivityScatterChart } from "./SensitivityScatterChart";
import { SensitivityTornadoChart } from "./SensitivityTornadoChart";
import { SobolScatterChart } from "./SobolScatterChart";
import { SobolTornadoChart } from "./SobolTornadoChart";
import { useI18n } from "./i18n";

/**
 * Two independent screens of the same six social-force fitted constants,
 * each off the main thread the same way `ExperimentSweepPanel` runs a
 * sweep — every point is one real simulation run:
 *
 * - **Morris (1991) elementary-effects screening**: ranks parameters by how
 *   much they move a scenario's throughput. Cheap (the default here is 42
 *   evaluations) but only ranks effect size, not variance share.
 * - **Sobol variance decomposition** (`sobolAnalysis.ts`): decomposes *how
 *   much* of the output's variance each parameter explains, alone
 *   (first-order) and through interaction with the others (total-order).
 *   A real, substantially more expensive method (this panel's default is
 *   64 evaluations, and the module's own default sample count would be
 *   512 — cut down here the same way Morris's trajectory count already is,
 *   for interactive tractability, not statistical adequacy).
 *
 * Neither is a boundary change over already-live parameters, so neither
 * got its own ADR when it was built (Sobol's ADR-0027 covered the
 * algorithm itself; this file is the UI wiring that followed).
 */

const defaultTrajectoryCount = 6;
const defaultSobolSampleCount = 8;

type SensitivityState =
  | { kind: "idle" }
  | { kind: "running"; progress: ExperimentQueueProgress | null }
  | { kind: "done"; summary: MorrisSummary[] }
  | { kind: "failed"; message: string };

type SobolState =
  | { kind: "idle" }
  | { kind: "running"; progress: ExperimentQueueProgress | null }
  | { kind: "done"; summary: SobolSummary[] }
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
  const [sobolState, setSobolState] = useState<SobolState>({ kind: "idle" });
  const sobolAbortRef = useRef<AbortController | null>(null);
  const sobolSamplesRef = useRef<SobolSampleMatrices | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => () => sobolAbortRef.current?.abort(), []);

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

  const runSobol = useCallback(() => {
    const controller = new AbortController();
    sobolAbortRef.current = controller;
    setSobolState({ kind: "running", progress: null });

    const { experiment, samples } = buildSobolExperiment(
      rimeaCoreScenarios[0],
      undefined,
      { sampleCount: defaultSobolSampleCount },
    );
    sobolSamplesRef.current = samples;

    runExperimentInBackgroundWorker(experiment, {
      onProgress: (progress) => setSobolState({ kind: "running", progress }),
      signal: controller.signal,
      workerFactory,
    })
      .then((results: ExperimentRunResult[]) => {
        setSobolState({
          kind: "done",
          summary: summarizeSobolExperimentResults(
            defaultSocialForceScreeningParameters,
            sobolSamplesRef.current!,
            results,
          ),
        });
      })
      .catch((error: unknown) => {
        setSobolState({
          kind: "failed",
          message: error instanceof Error ? error.message : "Sobol run failed",
        });
      });
  }, [workerFactory]);

  const stopSobol = useCallback(() => sobolAbortRef.current?.abort(), []);
  const zh = language === "zh";
  const title = zh ? "参数敏感性" : "Parameter sensitivity";

  return (
    <section className="probe-panel" aria-label={title}>
      <h3>{title}</h3>
      <h4>{zh ? "Morris 筛选" : "Morris screening"}</h4>
      <p>
        {zh
          ? `社会力模型自身的拟合常数，哪几个对吞吐量影响最大——Morris 逐一改变法（elementary effects），${defaultTrajectoryCount} 条轨迹，在后台线程跑。只排名，不分解方差占比（那是下方的 Sobol 指数）。`
          : `Which of the social-force model's own fitted constants moves throughput the most — Morris elementary-effects screening, ${defaultTrajectoryCount} trajectories, in a background worker. Ranks by effect, does not decompose variance share (that is the Sobol indices below).`}
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
        <>
          <SensitivityTornadoChart language={language} summary={state.summary} />
          <SensitivityScatterChart language={language} summary={state.summary} />
          <ol className="sensitivity-ranking">
            {state.summary.map((entry, index) => (
              <li key={entry.parameterId} data-testid={`sensitivity-rank-${index}`}>
                {entry.parameterId}: μ*={entry.meanAbsoluteEffect.toFixed(3)}, σ=
                {entry.stdDevEffect.toFixed(3)}
              </li>
            ))}
          </ol>
        </>
      ) : null}

      <h4>{zh ? "Sobol 方差分解" : "Sobol variance decomposition"}</h4>
      <p>
        {zh
          ? `同一批参数各自解释了多少输出方差——一阶（Sᵢ，参数单独的贡献）与总阶（Sᵀᵢ，含与其它参数的交互）。比 Morris 贵得多：本面板用 ${defaultSobolSampleCount} 个样本（模块自己的默认是 64，这里为了能在面板里点一下就等到结果而调小，不是统计上足够的样本量）。`
          : `How much of the output's variance the same parameters each explain — first-order (Sᵢ, on its own) and total-order (Sᵀᵢ, including interaction with the others). Much more expensive than Morris: this panel uses ${defaultSobolSampleCount} samples (the module's own default is 64 — cut down here for interactive tractability, not statistical adequacy).`}
      </p>
      {sobolState.kind === "running" ? (
        <button type="button" data-testid="sobol-stop" onClick={stopSobol}>
          {zh ? "停止" : "Stop"}
        </button>
      ) : (
        <button type="button" data-testid="sobol-run" onClick={runSobol}>
          {zh ? "开始分解" : "Run decomposition"}
        </button>
      )}
      {sobolState.kind === "running" ? (
        <code data-testid="sobol-progress">
          {zh ? "进行中" : "running"} {sobolState.progress?.completed ?? 0}/
          {sobolState.progress?.total ?? "?"}
        </code>
      ) : null}
      {sobolState.kind === "failed" ? (
        <code data-testid="sobol-error">{sobolState.message}</code>
      ) : null}
      {sobolState.kind === "done" ? (
        <>
          <SobolTornadoChart language={language} summary={sobolState.summary} />
          <SobolScatterChart language={language} summary={sobolState.summary} />
          <ol className="sensitivity-ranking">
            {sobolState.summary.map((entry, index) => (
              <li key={entry.parameterId} data-testid={`sobol-rank-${index}`}>
                {entry.parameterId}: Sᵢ={entry.firstOrder.toFixed(3)}, Sᵀᵢ=
                {entry.totalOrder.toFixed(3)}
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </section>
  );
}
