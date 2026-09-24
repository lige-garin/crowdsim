import { EChart } from "./EChart";
import { buildSensitivityScatterOption } from "./sensitivityScatter";
import type { MorrisSummary } from "./sensitivityAnalysis";

export function SensitivityScatterChart({
  language,
  summary,
}: {
  language: "en" | "zh";
  summary: readonly MorrisSummary[];
}) {
  return (
    <EChart
      ariaLabel={language === "zh" ? "μ*–σ 散点" : "μ*-σ scatter"}
      height={160}
      option={buildSensitivityScatterOption(summary)}
    />
  );
}
