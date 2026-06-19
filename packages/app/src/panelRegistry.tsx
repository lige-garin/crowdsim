import type { ReactNode } from "react";
import type { TrajectoryRecording } from "./trajectoryRecording";
import { ScenarioComparisonPanel } from "./ScenarioComparisonPanel";
import { ExperimentSweepPanel } from "./ExperimentSweepPanel";
import { ExperimentSummaryPanel } from "./ExperimentSummaryPanel";
import { ValidationReportPanel } from "./ValidationReportPanel";

export type PanelDockContext = {
  trajectoryRecording: TrajectoryRecording;
  // Refined to the real brand-insight type in SP-5a Task 3.
  brandInsight?: unknown;
};

export type PanelRegistryEntry = {
  id: string;
  labelZh: string;
  labelEn: string;
  render: (ctx: PanelDockContext) => ReactNode;
};

// Panels are registered in SP-5a Tasks 2-5.
export const panelRegistry: PanelRegistryEntry[] = [
  {
    id: "scenario-comparison",
    labelZh: "情景对比",
    labelEn: "Scenario comparison",
    render: () => <ScenarioComparisonPanel />,
  },
  {
    id: "experiment-sweep",
    labelZh: "参数扫描",
    labelEn: "Experiment sweep",
    render: () => <ExperimentSweepPanel />,
  },
  {
    id: "experiment-summary",
    labelZh: "实验汇总",
    labelEn: "Experiment summary",
    render: () => <ExperimentSummaryPanel />,
  },
  {
    id: "validation-report",
    labelZh: "校验报告",
    labelEn: "Validation report",
    render: () => <ValidationReportPanel />,
  },
];

