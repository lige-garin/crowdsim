import { useMemo } from "react";
import { rimeaCoreScenarios } from "./benchmarkScenarios";
import { runExperiment } from "./experimentRunner";
import {
  createExperimentFromSweep,
  summarizeMonteCarloDistribution,
} from "./experimentSweep";
import { createExperimentWorkerRequest } from "./experimentWorkerClient";
import { useI18n } from "./i18n";

export function ExperimentSweepPanel() {
  const { language } = useI18n();
  const summary = useMemo(() => {
    const experiment = createExperimentFromSweep({
      id: "exit-width-sweep-preview",
      name: "Exit width sweep preview",
      parameter: {
        end: 4,
        kind: "entrance-width",
        start: 2,
        step: 1,
        targetEntranceId: "east-sink",
      },
      replications: 3,
      scenario: rimeaCoreScenarios[0],
    });
    const results = runExperiment(experiment);
    const workerRequest = createExperimentWorkerRequest(experiment);
    const distribution = summarizeMonteCarloDistribution(results);
    const best = Object.entries(distribution).sort(
      (left, right) => right[1].p95 - left[1].p95,
    )[0];

    return {
      bestId: best?.[0] ?? "none",
      p95: best?.[1].p95 ?? 0,
      variantCount: experiment.variants.length,
      workerMode: `${workerRequest.mode} | ${workerRequest.execution} | jobs ${workerRequest.totalJobs}`,
    };
  }, []);
  const title = language === "zh" ? "参数扫描" : "Parameter sweep";

  return (
    <section className="probe-panel" aria-label={title}>
      <h3>{title}</h3>
      <p>
        {language === "zh"
          ? "出口宽度扫描，Monte Carlo 输出 P95 指标。"
          : "Exit-width sweep with Monte Carlo P95 metrics."}
      </p>
      <code>
        variants {summary.variantCount} | best {summary.bestId} | p95 {summary.p95}
      </code>
      <code>worker {summary.workerMode}</code>
    </section>
  );
}
