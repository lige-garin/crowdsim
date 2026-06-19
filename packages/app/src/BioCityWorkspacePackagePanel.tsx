import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { useMemo } from "react";
import {
  createBioCityWorkspacePackage,
  createBioCityWorkspaceTemplates,
  serializeBioCityWorkspacePackage,
} from "./bioCityWorkspacePackage";
import type { HeatmapCell } from "./heatmap";
import type { TrajectoryRecording } from "./trajectoryRecording";

export function BioCityWorkspacePackagePanel({
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
  const summary = useMemo(() => {
    const workspacePackage = createBioCityWorkspacePackage({
      elapsedSeconds,
      heatmapCells,
      language: "en",
      recording,
      scene,
    });
    const serialized = serializeBioCityWorkspacePackage(workspacePackage);
    const templates = createBioCityWorkspaceTemplates();

    return {
      analyticsRiskCount: workspacePackage.analytics.activeRiskCount,
      packageBytes: serialized.length,
      pdfReady: workspacePackage.report.pdfReady,
      replayFrames: workspacePackage.packedReplay.frames.length,
      reportDigest: workspacePackage.report.contentDigest,
      reportFilename: workspacePackage.report.filename,
      templateCount: templates.length,
      templatePreview: templates.slice(0, 4).map((template) => template.id),
    };
  }, [elapsedSeconds, heatmapCells, recording, scene]);

  return (
    <section className="probe-panel" aria-label="BioCity workspace package">
      <h3>BioCity workspace package</h3>
      <p>
        Save/load package, template library, packed replay, and printable report are
        bundled for the current BioCity scene.
      </p>
      <code>
        package {summary.packageBytes}b | templates {summary.templateCount} | replay{" "}
        {summary.replayFrames} frames | risks {summary.analyticsRiskCount}
      </code>
      <code>
        report {summary.reportFilename} | PDF-ready {summary.pdfReady ? "yes" : "no"} |
        digest {summary.reportDigest}
      </code>
      <code>templates {summary.templatePreview.join(" | ")}</code>
    </section>
  );
}
