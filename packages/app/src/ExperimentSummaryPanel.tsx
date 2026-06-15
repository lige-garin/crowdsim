import { useMemo } from "react";
import { rimeaCoreScenarios } from "./benchmarkScenarios";
import {
  rankExperimentVariants,
  runExperiment,
  summarizeExperimentResults,
} from "./experimentRunner";
import { useI18n } from "./i18n";

export function ExperimentSummaryPanel() {
  const { language } = useI18n();
  const ranking = useMemo(() => {
    const results = runExperiment({
      id: "default-corridor-speed-sweep",
      name: "Default corridor speed sweep",
      replications: 3,
      scenario: rimeaCoreScenarios[0],
      variants: [
        {
          id: "baseline",
          name: language === "zh" ? "基线" : "Baseline",
        },
        {
          id: "slow-crowd",
          name: language === "zh" ? "慢速人群" : "Slow crowd",
          simulationOverrides: {
            speedMetersPerSecond: 0.9,
          },
        },
      ],
    });

    return rankExperimentVariants(summarizeExperimentResults(results));
  }, [language]);
  const title = language === "zh" ? "实验 Runner" : "Experiment Runner";
  const subtitle =
    language === "zh"
      ? "走廊速度方案对比，3 次 Monte Carlo 复制。"
      : "Corridor speed variant comparison with 3 Monte Carlo replications.";

  return (
    <section className="probe-panel" aria-label={title}>
      <h3>{title}</h3>
      <p>{subtitle}</p>
      <ol className="experiment-ranking">
        {ranking.map((summary) => (
          <li key={summary.variantId}>
            <span>{summary.variantName}</span>
            <code>
              {summary.throughputMean}/min ± {summary.throughputStdDev}
            </code>
          </li>
        ))}
      </ol>
    </section>
  );
}
