import { useCallback, useState } from "react";
import { useI18n } from "./i18n";
import {
  summarizeRimeaSuite,
  unattemptedRimeaTests,
  type RimeaTestResult,
} from "./rimeaSuite";
import { runRimeaSuiteInWorker, type RimeaWorkerLike } from "./rimeaWorkerClient";

/**
 * Where this engine stands against RiMEA's fourteen verification tests.
 *
 * The panel shows all sixteen before anything is run, each with its status,
 * so the answer to "which ones pass?" is never a blank. Running fills in the
 * one test whose geometry and criterion are recorded here; the rest keep
 * saying why they were not attempted.
 *
 * A failure is displayed as a failure. Nothing in this panel is tuned until
 * it goes green.
 */

const copy = {
  en: {
    idle: "Not run yet. One test is implemented; the rest say why not. The numbers and titles below are unverified against RiMEA 3.0.",
    run: "Run suite",
    running: "Running the corridor measurements…",
    status: {
      fail: "FAIL",
      "needs-scenario": "NOT BUILT",
      pass: "PASS",
    },
    summary: (pass: number, fail: number, blocked: number) =>
      `${pass} passed, ${fail} failed, ${blocked} not built, of 16`,
    title: "RiMEA verification",
  },
  zh: {
    idle: "RiMEA 4.1.1 附录 1 共 16 条。已实现 1 条；其余逐条标明出自哪一节、还缺什么。",
    run: "运行套件",
    running: "正在跑走廊实测…",
    status: {
      fail: "未通过",
      "needs-scenario": "未实现",
      pass: "通过",
    },
    summary: (pass: number, fail: number, blocked: number) =>
      `16 条中：通过 ${pass}，未通过 ${fail}，未实现 ${blocked}`,
    title: "RiMEA 验证",
  },
} as const;

export function RimeaReportPanel({
  workerFactory,
}: {
  /** Injected by tests; the app uses the real worker. */
  workerFactory?: () => RimeaWorkerLike;
} = {}) {
  const { language } = useI18n();
  const text = copy[language === "zh" ? "zh" : "en"];
  // Before a run, show the tests that need no measuring — which is all but one.
  const [results, setResults] =
    useState<readonly RimeaTestResult[]>(unattemptedRimeaTests);
  const [state, setState] = useState<"idle" | "running" | "done">("idle");

  const run = useCallback(() => {
    setState("running");
    runRimeaSuiteInWorker({ workerFactory })
      .then((suite) => {
        setResults(suite);
        setState("done");
      })
      .catch(() => setState("idle"));
  }, [workerFactory]);

  const summary = summarizeRimeaSuite(results);

  return (
    <section className="probe-panel rimea-report" aria-label={text.title}>
      <h3>{text.title}</h3>
      <p>{state === "running" ? text.running : text.idle}</p>
      <button
        type="button"
        data-testid="rimea-run"
        disabled={state === "running"}
        onClick={run}
      >
        {text.run}
      </button>
      <code data-testid="rimea-summary">
        {text.summary(summary.pass, summary.fail, summary.needsScenario)}
      </code>
      <ol className="rimea-list">
        {[...results]
          .sort((left, right) => left.number - right.number)
          .map((result) => (
            <li key={result.number} data-testid={`rimea-test-${result.number}`}>
              <strong>
                {result.number}. {result.title}
              </strong>
              <span className={`rimea-status rimea-status-${result.status}`}>
                {text.status[result.status]}
              </span>
              {/* Whichever applies: what was measured, or why it was not. */}
              <span className="rimea-detail">
                {result.measured ?? result.blockedBy}
              </span>
              {result.criterion ? (
                <span className="rimea-detail">{result.criterion}</span>
              ) : null}
            </li>
          ))}
      </ol>
    </section>
  );
}
