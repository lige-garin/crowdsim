import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { useMemo } from "react";
import {
  createBioCityAnalyticsAcceptanceAudit,
  createBioCityAnalyticsAcceptanceReport,
} from "./bioCityAnalyticsAcceptance";
import type { HeatmapCell } from "./heatmap";

export function BioCityAnalyticsAcceptancePanel({
  elapsedSeconds,
  heatmapCells,
  scene,
}: {
  elapsedSeconds: number;
  heatmapCells: readonly HeatmapCell[];
  scene: CrowdSimScene;
}) {
  const { audit, report } = useMemo(() => {
    const report = createBioCityAnalyticsAcceptanceReport({
      elapsedSeconds,
      heatmapCells,
      scene,
    });

    return {
      audit: createBioCityAnalyticsAcceptanceAudit(report),
      report,
    };
  }, [elapsedSeconds, heatmapCells, scene]);

  return (
    <section className="probe-panel" aria-label="BioCity analytics acceptance">
      <h3>BioCity analytics acceptance</h3>
      <p>
        Phase 3.8 gate {audit.completeCount}/{audit.itemCount} complete |{" "}
        {audit.completionPercent}% | blockers {audit.remainingBlockers.length}
      </p>
      {report.map((item) => (
        <code key={item.id}>
          {item.id} {item.status} | {item.evidence.join(" | ")}
        </code>
      ))}
    </section>
  );
}
