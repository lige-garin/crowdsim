import { buildJourneyTimeHistogramOption } from "./journeyHistogram";
import { EChart } from "./EChart";

export function JourneyTimeHistogram({
  durations,
  language,
  p50Seconds,
  p90Seconds,
}: {
  durations: readonly number[];
  language: "en" | "zh";
  p50Seconds: number;
  p90Seconds: number;
}) {
  return (
    <EChart
      ariaLabel={language === "zh" ? "行程时间分布" : "Journey time distribution"}
      height={110}
      option={buildJourneyTimeHistogramOption(
        durations,
        p50Seconds,
        p90Seconds,
        language,
      )}
    />
  );
}
