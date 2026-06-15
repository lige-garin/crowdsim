import { useMemo } from "react";
import { rimeaCoreScenarios } from "./benchmarkScenarios";
import { compareExperimentVariants, formatDeltaPercent } from "./scenarioComparison";
import { useI18n } from "./i18n";

export function ScenarioComparisonPanel() {
  const { language } = useI18n();
  const comparison = useMemo(() => {
    const scenario = rimeaCoreScenarios[1];

    return compareExperimentVariants({
      id: "bottleneck-side-by-side",
      name: "Bottleneck side-by-side comparison",
      replications: 3,
      scenario,
      variants: [
        {
          id: "baseline",
          name: language === "zh" ? "基线" : "Baseline",
        },
        {
          id: "wider-exit",
          name: language === "zh" ? "出口加宽" : "Wider exit",
          scene: {
            ...scenario.scene,
            entrances: scenario.scene.entrances.map((entrance) =>
              entrance.kind === "sink"
                ? {
                    ...entrance,
                    width: entrance.width + 2,
                  }
                : entrance,
            ),
          },
        },
        {
          id: "managed-speed",
          name: language === "zh" ? "控速人群" : "Managed speed",
          simulationOverrides: {
            speedMetersPerSecond: 1.05,
          },
        },
      ],
    });
  }, [language]);
  const title = language === "zh" ? "方案对比" : "Scenario comparison";

  return (
    <section className="probe-panel" aria-label={title}>
      <h3>{title}</h3>
      <p>
        {language === "zh"
          ? "瓶颈场景的并排方案指标。"
          : "Side-by-side metrics for the bottleneck scenario."}
      </p>
      <div className="comparison-grid">
        {comparison.rows.map((row) => (
          <article className="comparison-card" key={row.variantId}>
            <span>#{row.rank}</span>
            <strong>{row.variantName}</strong>
            <code>{row.throughputMean}/min</code>
            <small>
              {formatDeltaPercent(row.throughputDeltaPercent)} | pass{" "}
              {Math.round(row.passRate * 100)}%
            </small>
          </article>
        ))}
      </div>
    </section>
  );
}
