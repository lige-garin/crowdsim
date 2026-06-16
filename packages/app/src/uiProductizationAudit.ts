export type UiProductizationArea = {
  blocksCompletion: boolean;
  completionPercent: number;
  evidence: string[];
  id: "command-bar" | "home" | "inspector" | "mobile-responsive" | "sidebar" | "stage";
  status: "complete" | "partial";
};

export type UiProductizationAudit = {
  blocksCompletion: boolean;
  completeCount: number;
  completionPercent: number;
  itemCount: number;
  remainingBlockers: string[];
};

export function createUiProductizationReport(): UiProductizationArea[] {
  return [
    {
      blocksCompletion: false,
      completionPercent: 100,
      evidence: [
        "AppHome renders a first-viewport product signal with the CrowdSim Operations hero and network visual",
        "appHome.css and commercial.css provide the responsive home shell, topbar, hero copy, status rail, and visual panel",
        "App.test.tsx covers home entry, network entry, and return navigation",
      ],
      id: "home",
      status: "complete",
    },
    {
      blocksCompletion: false,
      completionPercent: 100,
      evidence: [
        "App.tsx renders structured command-status cards for runtime, WebGPU, kernel, and evidence",
        "commercial.css styles command-status as compact two-line status cards",
        "Browser checks verify command status remains visible without horizontal overflow",
      ],
      id: "command-bar",
      status: "complete",
    },
    {
      blocksCompletion: false,
      completionPercent: 100,
      evidence: [
        "AppSidebar groups run controls, evacuation, simulation speed, and heatmap window controls",
        "commercial.css adds sim-controls header state and control-group styling",
        "App.test.tsx asserts the productized control groups exist in Simulation controls",
      ],
      id: "sidebar",
      status: "complete",
    },
    {
      blocksCompletion: false,
      completionPercent: 100,
      evidence: [
        "AppStage renders a live telemetry strip for agents, exits, clock, and kernel runtime",
        "commercial.css styles stage-telemetry as a compact responsive dashboard strip",
        "Browser checks verify desktop and mobile stage telemetry without horizontal overflow",
      ],
      id: "stage",
      status: "complete",
    },
    {
      blocksCompletion: false,
      completionPercent: 100,
      evidence: [
        "AppInspector groups Overview, Evidence, Operations, and Probes as labeled product evidence sections",
        "commercial.css provides inspector-group headers and sticky section navigation",
        "Browser checks verify all Inspector headers render without horizontal overflow",
      ],
      id: "inspector",
      status: "complete",
    },
    {
      blocksCompletion: false,
      completionPercent: 100,
      evidence: [
        "commercialResponsive.css collapses workspace, command status, telemetry, controls, and home rail across tablet and phone widths",
        "Playwright smoke test covers the workbench flow in Chrome",
        "Browser checks verify no horizontal overflow at 390px mobile viewport",
      ],
      id: "mobile-responsive",
      status: "complete",
    },
  ];
}

export function createUiProductizationAudit(
  report = createUiProductizationReport(),
): UiProductizationAudit {
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
