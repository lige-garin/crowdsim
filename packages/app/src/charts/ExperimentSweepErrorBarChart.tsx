import { EChart } from "./EChart";
import { buildExperimentSweepErrorBarOption } from "./experimentSweepErrorBars";
import type { MetricDistribution } from "../analytics/experimentSweep";

export function ExperimentSweepErrorBarChart({
  distribution,
  language,
}: {
  distribution: Record<string, MetricDistribution>;
  language: "en" | "zh";
}) {
  return (
    <EChart
      ariaLabel={language === "zh" ? "均值与 95% 置信区间" : "Mean with 95% CI"}
      height={140}
      option={buildExperimentSweepErrorBarOption(distribution)}
    />
  );
}
