import { buildCountLineFlowOption } from "./countLineFlow";
import { EChart } from "./EChart";
import type { MinuteFlow } from "./runAnalytics";

export function CountLineFlowChart({
  flows,
  language,
  name,
}: {
  flows: readonly MinuteFlow[];
  language: "en" | "zh";
  name: string;
}) {
  return (
    <EChart
      ariaLabel={`${name} ${language === "zh" ? "每分钟流量" : "flow per minute"}`}
      height={110}
      option={buildCountLineFlowOption(flows, language)}
    />
  );
}
