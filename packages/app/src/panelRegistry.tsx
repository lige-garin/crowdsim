import type { ReactNode } from "react";
import type { TrajectoryRecording } from "./trajectoryRecording";
import type { BrandDecisionInsight } from "./brandDecisionProbe";
import type { BackendClient } from "./backendClient";
import { ScenarioComparisonPanel } from "./ScenarioComparisonPanel";
import { ExperimentSweepPanel } from "./ExperimentSweepPanel";
import { ExperimentSummaryPanel } from "./ExperimentSummaryPanel";
import { ValidationReportPanel } from "./ValidationReportPanel";
import { BrandIntelligencePanel } from "./BrandIntelligencePanel";
import { ScaleReadinessPanel } from "./ScaleReadinessPanel";
import { ProjectWorkspacePanel } from "./ProjectWorkspacePanel";
import { CollaborationStatusPanel } from "./CollaborationStatusPanel";
import { TemplateLibraryPanel } from "./TemplateLibraryPanel";
import { AiWorkflowPanel } from "./AiWorkflowPanel";
import { ImageGeometryPanel } from "./ImageGeometryPanel";
import { TilesBackdropPanel } from "./TilesBackdropPanel";
import { TrajectoryReplayPanel } from "./TrajectoryReplayPanel";

export type PanelDockContext = {
  trajectoryRecording: TrajectoryRecording;
  brandInsight?: BrandDecisionInsight;
  // When provided, project-workspace lists live projects; otherwise it shows
  // honestly-labeled sample data. Wired by the App once a backend is configured.
  backendClient?: BackendClient;
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
  {
    id: "brand-intelligence",
    labelZh: "品牌智能",
    labelEn: "Brand intelligence",
    render: (ctx) => <BrandIntelligencePanel insight={ctx.brandInsight} />,
  },
  {
    id: "scale-readiness",
    labelZh: "规模就绪",
    labelEn: "Scale readiness",
    render: () => <ScaleReadinessPanel />,
  },
  {
    id: "project-workspace",
    labelZh: "项目空间",
    labelEn: "Project workspace",
    render: (ctx) => <ProjectWorkspacePanel client={ctx.backendClient} />,
  },
  {
    id: "collaboration-status",
    labelZh: "协作状态",
    labelEn: "Collaboration",
    render: () => <CollaborationStatusPanel />,
  },
  {
    id: "template-library",
    labelZh: "模板库",
    labelEn: "Template library",
    render: () => <TemplateLibraryPanel />,
  },
  {
    id: "ai-workflow",
    labelZh: "AI 工作流",
    labelEn: "AI workflow",
    render: () => <AiWorkflowPanel />,
  },
  {
    id: "image-geometry",
    labelZh: "影像几何",
    labelEn: "Image geometry",
    render: () => <ImageGeometryPanel />,
  },
  {
    id: "tiles-backdrop",
    labelZh: "瓦片底图",
    labelEn: "Tiles backdrop",
    render: () => <TilesBackdropPanel />,
  },
  {
    id: "trajectory-replay",
    labelZh: "轨迹回放",
    labelEn: "Trajectory replay",
    render: (ctx) => <TrajectoryReplayPanel recording={ctx.trajectoryRecording} />,
  },
];

