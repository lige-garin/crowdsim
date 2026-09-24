import { EChart } from "./EChart";
import { buildSobolTornadoOption } from "./sobolTornado";
import type { SobolSummary } from "./sobolAnalysis";

export function SobolTornadoChart({
  language,
  summary,
}: {
  language: "en" | "zh";
  summary: readonly SobolSummary[];
}) {
  return (
    <EChart
      ariaLabel={
        language === "zh" ? "一阶 Sobol 指数排名" : "First-order Sobol ranking"
      }
      height={Math.max(60, summary.length * 22)}
      option={buildSobolTornadoOption(summary)}
    />
  );
}
