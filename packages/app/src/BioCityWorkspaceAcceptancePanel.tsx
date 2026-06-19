import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { useMemo } from "react";
import {
  createBioCityWorkspaceAcceptanceAudit,
  createBioCityWorkspaceAcceptanceReport,
} from "./bioCityWorkspaceAcceptance";
import { createBioCityWorkspacePackage } from "./bioCityWorkspacePackage";
import type { HeatmapCell } from "./heatmap";
import type { TrajectoryRecording } from "./trajectoryRecording";

export function BioCityWorkspaceAcceptancePanel({
  elapsedSeconds,
  heatmapCells,
  recording,
  scene,
}: {
  elapsedSeconds: number;
  heatmapCells: readonly HeatmapCell[];
  recording: TrajectoryRecording;
  scene: CrowdSimScene;
}) {
  const { audit, report } = useMemo(() => {
    const workspacePackage = createBioCityWorkspacePackage({
      elapsedSeconds,
      heatmapCells,
      language: "en",
      recording,
      scene,
    });
    const report = createBioCityWorkspaceAcceptanceReport(workspacePackage);

    return {
      audit: createBioCityWorkspaceAcceptanceAudit(report),
      report,
    };
  }, [elapsedSeconds, heatmapCells, recording, scene]);

  return (
    <section className="probe-panel" aria-label="BioCity workspace acceptance">
      <h3>BioCity workspace acceptance</h3>
      <p>
        Phase 3.9 gate {audit.completeCount}/{audit.itemCount} complete |{" "}
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
