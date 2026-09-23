import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { useEffect, useMemo, useState } from "react";
import { createAiValidationReportSummary } from "./aiReport";
import { createReportBlob, createValidationReportExportBundle } from "./reportExport";
import {
  createValidationReportFromBenchmarkResults,
  type ValidationReport,
} from "./validationReport";
import {
  runValidationBenchmarksInWorker,
  type ValidationBenchmarkWorkerLike,
} from "./validationBenchmarkWorkerClient";
import { useI18n } from "./i18n";

/**
 * The printable report for the scene the user has open. It used to be built with
 * no scene at all, so the exported PDF described the built-in RiMEA fixtures and
 * nothing of the user's project. The benchmark section still runs those fixtures:
 * it checks the engine, and the report says so.
 *
 * The benchmark suite itself (four ~90-100s scenarios, thousands of physics
 * steps) used to run synchronously inside a `useMemo` during render --
 * freezing the page every time this panel mounted or the scene changed. It
 * now runs in a worker (`validationBenchmarkWorkerClient.ts`), the same
 * shape `RimeaReportPanel.tsx` already established for its own benchmark
 * suite.
 *
 * The caller (`panelRegistry.tsx`) mounts this with `key={scene.id}`, so a
 * scene change remounts it -- fresh initial state for free, rather than an
 * effect reaching back to reset it (which `eslint-plugin-react-hooks`'s
 * `set-state-in-effect` rule flags for good reason: a synchronous
 * `setState` at the top of an effect body causes an extra cascading
 * render). Tests that render this directly, with no list/key context,
 * don't need the key at all -- React only uses it for reconciliation
 * against siblings, and a lone root has none.
 */
export function ValidationReportPanel({
  scene,
  workerFactory,
}: {
  scene: CrowdSimScene;
  /** Injected by tests; the app uses the real worker. */
  workerFactory?: () => ValidationBenchmarkWorkerLike;
}) {
  const { language } = useI18n();
  const [opened, setOpened] = useState(false);
  const [state, setState] = useState<
    | { kind: "running" }
    | { kind: "ready"; report: ValidationReport }
    | { kind: "failed"; message: string }
  >({ kind: "running" });

  useEffect(() => {
    let cancelled = false;

    runValidationBenchmarksInWorker({ workerFactory })
      .then((benchmarkResults) => {
        if (cancelled) return;
        setState({
          kind: "ready",
          report: createValidationReportFromBenchmarkResults(benchmarkResults, {
            commercialScene: scene,
          }),
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          kind: "failed",
          message:
            error instanceof Error ? error.message : "Validation benchmark failed",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [scene, workerFactory]);

  const title = language === "zh" ? "校准报告" : "Calibration report";
  const runningLabel =
    language === "zh"
      ? "正在跑引擎回归基准（4 个场景）…"
      : "Running the engine regression benchmarks (4 scenarios)…";

  if (state.kind === "running") {
    return (
      <section className="probe-panel" aria-label={title}>
        <h3>{title}</h3>
        <p>{runningLabel}</p>
      </section>
    );
  }

  if (state.kind === "failed") {
    return (
      <section className="probe-panel" aria-label={title}>
        <h3>{title}</h3>
        <code data-testid="validation-report-error">{state.message}</code>
      </section>
    );
  }

  return (
    <ValidationReportReady
      language={language}
      opened={opened}
      report={state.report}
      setOpened={setOpened}
      title={title}
    />
  );
}

function ValidationReportReady({
  language,
  opened,
  report,
  setOpened,
  title,
}: {
  language: "en" | "zh";
  opened: boolean;
  report: ValidationReport;
  setOpened: (opened: boolean) => void;
  title: string;
}) {
  const sceneName = report.sceneName;
  const aiSummary = useMemo(
    () => createAiValidationReportSummary(report, language),
    [language, report],
  );
  const exportBundle = useMemo(
    () => createValidationReportExportBundle(report, language),
    [language, report],
  );
  const passLabel = language === "zh" ? "通过" : "passed";
  const failLabel = language === "zh" ? "失败" : "failed";
  const printLabel = language === "zh" ? "打印 / 导出 PDF" : "Print / export PDF";
  const note =
    language === "zh"
      ? `场景「${sceneName}」的商业参数校验；另附引擎回归基准（RiMEA 命名的自拟场景，与本场景无关）、Weidmann 密度-速度对比和 IMO 人群参数来源。`
      : `Commercial checks for "${sceneName}", plus engine regression fixtures (self-authored, RiMEA-named, independent of this scene), the Weidmann density-speed comparison, and IMO pedestrian preset sources.`;

  function openPrintableReport() {
    const blob = createReportBlob(exportBundle);
    const url = URL.createObjectURL(blob);

    window.open(url, "_blank", "noopener,noreferrer");
    setOpened(true);
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  return (
    <section className="probe-panel" aria-label={title}>
      <h3>{title}</h3>
      <p>{note}</p>
      <code>
        {report.benchmarkSummary.passCount}/{report.benchmarkSummary.totalCount}{" "}
        {passLabel} | {report.benchmarkSummary.failCount} {failLabel}
      </code>
      <code>
        PDF-ready {exportBundle.pdfReady ? "yes" : "no"} | {exportBundle.filename}
      </code>
      <code>
        physics error {report.residualProjectionValidation.baselineMeanError} |
        +residual {report.residualProjectionValidation.correctedMeanError} | in-sample{" "}
        {Math.round(report.residualProjectionValidation.improvementRatio * 100)}%
      </code>
      <p>
        {aiSummary.title}: {aiSummary.paragraphs[0]} Risk {aiSummary.riskLevel}
      </p>
      <button type="button" onClick={openPrintableReport}>
        {printLabel}
      </button>
      {opened ? (
        <span>{language === "zh" ? "已打开报告" : "Report opened"}</span>
      ) : null}
    </section>
  );
}
