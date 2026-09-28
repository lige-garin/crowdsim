import { EChart } from "./EChart";
import { buildSensitivityTornadoOption } from "./sensitivityTornado";
import type { MorrisSummary } from "../analytics/sensitivityAnalysis";

export function SensitivityTornadoChart({
  language,
  summary,
}: {
  language: "en" | "zh";
  summary: readonly MorrisSummary[];
}) {
  return (
    <EChart
      ariaLabel={language === "zh" ? "μ* 排名" : "μ* ranking"}
      height={Math.max(60, summary.length * 22)}
      option={buildSensitivityTornadoOption(summary)}
    />
  );
}
