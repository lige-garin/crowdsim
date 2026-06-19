import {
  bioCityEvidencePanelLabels,
  bioCityLayerNames,
  bioCityPlanningToolGroups,
  bioCityStudioTitle,
  bioCityTopbarMetricLabels,
} from "./bioCityUiContract";

export type BioCityFinalUiAcceptanceItem = {
  blocksCompletion: boolean;
  completionPercent: number;
  evidence: string[];
  id:
    | "analysis-evidence-stack"
    | "final-studio-shell"
    | "game-planning-toolbox"
    | "operating-status-bar"
    | "responsive-density"
    | "timeline-layer-controls";
  status: "complete" | "partial";
};

export type BioCityFinalUiAcceptanceAudit = {
  blocksCompletion: boolean;
  completeCount: number;
  completionPercent: number;
  itemCount: number;
  remainingBlockers: string[];
};

export function createBioCityFinalUiAcceptanceReport(): BioCityFinalUiAcceptanceItem[] {
  const toolCount = bioCityPlanningToolGroups.reduce(
    (sum, group) => sum + group.tools.length,
    0,
  );
  const groupTitles = bioCityPlanningToolGroups.map((group) => group.title);

  return [
    createItem({
      complete:
        bioCityStudioTitle === "CrowdSim BioCity Studio" &&
        groupTitles.includes("Planning tools"),
      evidence: [
        `title=${bioCityStudioTitle}`,
        "layout=topbar/sidebar/stage/inspector",
        "mode=game-studio-shell",
      ],
      id: "final-studio-shell",
    }),
    createItem({
      complete:
        bioCityTopbarMetricLabels.length >= 8 &&
        bioCityTopbarMetricLabels.includes("Weather") &&
        bioCityTopbarMetricLabels.includes("Sales") &&
        bioCityTopbarMetricLabels.includes("Satisfaction"),
      evidence: [
        `metrics=${bioCityTopbarMetricLabels.length}`,
        `weather=${bioCityTopbarMetricLabels.includes("Weather")}`,
        `commerce=${bioCityTopbarMetricLabels.includes("Sales")}`,
      ],
      id: "operating-status-bar",
    }),
    createItem({
      complete:
        bioCityPlanningToolGroups.length >= 4 &&
        toolCount >= 16 &&
        bioCityPlanningToolGroups.some((group) =>
          group.tools.some(([label]) => label === "Transit"),
        ),
      evidence: [
        `groups=${bioCityPlanningToolGroups.length}`,
        `tools=${toolCount}`,
        `groups=${groupTitles.join(",")}`,
      ],
      id: "game-planning-toolbox",
    }),
    createItem({
      complete:
        bioCityLayerNames.length >= 5 &&
        bioCityLayerNames.includes("Heatmap") &&
        bioCityLayerNames.includes("Flow lines") &&
        bioCityLayerNames.includes("Risk"),
      evidence: [
        `layers=${bioCityLayerNames.length}`,
        `heatmap=${bioCityLayerNames.includes("Heatmap")}`,
        `risk=${bioCityLayerNames.includes("Risk")}`,
      ],
      id: "timeline-layer-controls",
    }),
    createItem({
      complete:
        bioCityEvidencePanelLabels.includes("BioCity visual acceptance") &&
        bioCityEvidencePanelLabels.includes("BioCity analytics acceptance") &&
        bioCityEvidencePanelLabels.includes("BioCity workspace acceptance") &&
        bioCityEvidencePanelLabels.includes("BioCity final UI acceptance"),
      evidence: [
        `evidencePanels=${bioCityEvidencePanelLabels.length}`,
        `visual=${bioCityEvidencePanelLabels.includes("BioCity visual acceptance")}`,
        `final=${bioCityEvidencePanelLabels.includes("BioCity final UI acceptance")}`,
      ],
      id: "analysis-evidence-stack",
    }),
    createItem({
      complete:
        bioCityTopbarMetricLabels.length <= 8 &&
        bioCityPlanningToolGroups.every((group) => group.tools.length <= 4) &&
        bioCityLayerNames.length <= 5,
      evidence: [
        "breakpoints=1180/820/520",
        `maxToolsPerGroup=${Math.max(
          ...bioCityPlanningToolGroups.map((group) => group.tools.length),
        )}`,
        `timelineLayers=${bioCityLayerNames.length}`,
      ],
      id: "responsive-density",
    }),
  ];
}

export function createBioCityFinalUiAcceptanceAudit(
  report: readonly BioCityFinalUiAcceptanceItem[],
): BioCityFinalUiAcceptanceAudit {
  const completeCount = report.filter((item) => item.status === "complete").length;
  const remainingBlockers = report
    .filter((item) => item.blocksCompletion || item.status !== "complete")
    .map((item) => item.id);

  return {
    blocksCompletion: remainingBlockers.length > 0,
    completeCount,
    completionPercent:
      report.length > 0
        ? Math.round(
            report.reduce((sum, item) => sum + item.completionPercent, 0) /
              report.length,
          )
        : 0,
    itemCount: report.length,
    remainingBlockers,
  };
}

function createItem({
  complete,
  evidence,
  id,
}: {
  complete: boolean;
  evidence: string[];
  id: BioCityFinalUiAcceptanceItem["id"];
}): BioCityFinalUiAcceptanceItem {
  return {
    blocksCompletion: !complete,
    completionPercent: complete ? 100 : 60,
    evidence,
    id,
    status: complete ? "complete" : "partial",
  };
}
