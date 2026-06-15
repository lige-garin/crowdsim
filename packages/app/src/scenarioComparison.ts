import type { ExperimentDefinition, ExperimentSummary } from "./experimentRunner";
import {
  rankExperimentVariants,
  runExperiment,
  summarizeExperimentResults,
} from "./experimentRunner";

export type ScenarioComparisonRow = ExperimentSummary & {
  rank: number;
  throughputDeltaPercent: number;
};

export type ScenarioComparison = {
  baselineVariantId: string;
  rows: ScenarioComparisonRow[];
  winner: ScenarioComparisonRow | undefined;
};

export function compareExperimentVariants(
  experiment: ExperimentDefinition,
  baselineVariantId = experiment.variants[0]?.id ?? "",
): ScenarioComparison {
  const summaries = summarizeExperimentResults(runExperiment(experiment));
  const baseline =
    summaries.find((summary) => summary.variantId === baselineVariantId) ??
    summaries[0];
  const ranked = rankExperimentVariants(summaries);
  const rows = summaries.map((summary) => {
    const throughputDeltaPercent =
      baseline && baseline.throughputMean > 0
        ? round(
            ((summary.throughputMean - baseline.throughputMean) /
              baseline.throughputMean) *
              100,
          )
        : 0;

    return {
      ...summary,
      rank: ranked.findIndex((item) => item.variantId === summary.variantId) + 1,
      throughputDeltaPercent,
    };
  });

  return {
    baselineVariantId,
    rows,
    winner: rows.find((row) => row.rank === 1),
  };
}

export function formatDeltaPercent(value: number) {
  if (value > 0) {
    return `+${value}%`;
  }

  return `${value}%`;
}

function round(value: number) {
  return Number(value.toFixed(2));
}
