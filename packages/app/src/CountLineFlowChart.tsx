import { useState } from "react";
import { buildCountLineFlowOption } from "./countLineFlow";
import { EChart } from "./EChart";
import type { MinuteFlow } from "./runAnalytics";

/**
 * Collapsed by default: a scene can carry many count lines and each chart is
 * 110px tall. The chart mounts only while open, because ECharts sized inside a
 * closed <details> initialises at zero width and never recovers.
 */
export function CountLineFlowChart({
  flows,
  language,
  name,
}: {
  flows: readonly MinuteFlow[];
  language: "en" | "zh";
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const label = language === "zh" ? "每分钟流量" : "flow per minute";
  return (
    <details
      className="count-line-chart"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>{label}</summary>
      {open ? (
        <EChart
          ariaLabel={`${name} ${label}`}
          height={110}
          option={buildCountLineFlowOption(flows, language)}
        />
      ) : null}
    </details>
  );
}
