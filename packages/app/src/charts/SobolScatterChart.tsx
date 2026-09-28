import { EChart } from "./EChart";
import { buildSobolScatterOption } from "./sobolScatter";
import type { SobolSummary } from "../analytics/sobolAnalysis";

export function SobolScatterChart({
  language,
  summary,
}: {
  language: "en" | "zh";
  summary: readonly SobolSummary[];
}) {
  return (
    <EChart
      ariaLabel={
        language === "zh"
          ? "一阶/总阶 Sobol 指数散点"
          : "First/total-order Sobol scatter"
      }
      height={160}
      option={buildSobolScatterOption(summary)}
    />
  );
}
