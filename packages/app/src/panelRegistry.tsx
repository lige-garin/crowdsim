import type { CrowdSimScene } from "@crowdsim/scene-schema";
import type { ReactNode } from "react";
import type { TrajectoryRecording } from "./trajectoryRecording";
import type { BrandDecisionInsight } from "./brandDecisionProbe";
import type { BackendClient } from "./backendClient";
import { ScenarioComparisonPanel } from "./ScenarioComparisonPanel";
import { ScenarioDiffPanel } from "./ScenarioDiffPanel";
import { ExperimentSweepPanel } from "./ExperimentSweepPanel";
import { SensitivityPanel } from "./SensitivityPanel";
import { RimeaReportPanel } from "./RimeaReportPanel";
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
  /** The scene the app is running, for panels that report on the user's own project. */
  scene: CrowdSimScene;
  trajectoryRecording: TrajectoryRecording;
  brandInsight?: BrandDecisionInsight;
  // When provided, project-workspace lists live projects; otherwise it shows
  // honestly-labeled sample data. Wired by the App once a backend is configured.
  backendClient?: BackendClient;
};

/**
 * Where a panel's numbers come from.
 *
 * `live` reads the running simulation or a configured backend. `fixture` builds
 * its own hardcoded scenario in a useMemo and is unrelated to whatever the user
 * currently has open -- ScaleReadiness, for instance, reports on `demoScene`
 * (an atrium) while the app runs the rainy high street. Only ProjectWorkspace
 * used to say so; the dock now labels every fixture panel, because a panel that
 * looks authoritative and describes someone else's scene is worse than no panel.
 */
export type PanelDataSource = "live" | "fixture";

export type PanelRegistryEntry = {
  dataSource: PanelDataSource;
  id: string;
  labelZh: string;
  labelEn: string;
  render: (ctx: PanelDockContext) => ReactNode;
};

// Panels are registered in SP-5a Tasks 2-5.
export const panelRegistry: PanelRegistryEntry[] = [
  {
    dataSource: "fixture",
    id: "scenario-comparison",
    labelZh: "情景对比",
    labelEn: "Scenario comparison",
    render: () => <ScenarioComparisonPanel />,
  },
  {
    dataSource: "fixture",
    id: "scenario-diff-report",
    labelZh: "情景对比报告",
    labelEn: "Scenario diff report",
    render: () => <ScenarioDiffPanel />,
  },
  {
    dataSource: "fixture",
    id: "rimea-verification",
    labelZh: "RiMEA 验证",
    labelEn: "RiMEA verification",
    render: () => <RimeaReportPanel />,
  },
  {
    dataSource: "fixture",
    id: "experiment-sweep",
    labelZh: "参数扫描",
    labelEn: "Experiment sweep",
    render: () => <ExperimentSweepPanel />,
  },
  {
    dataSource: "fixture",
    id: "experiment-summary",
    labelZh: "实验汇总",
    labelEn: "Experiment summary",
    render: () => <ExperimentSummaryPanel />,
  },
  {
    dataSource: "fixture",
    id: "sensitivity-screening",
    labelZh: "参数敏感性",
    labelEn: "Parameter sensitivity",
    render: () => <SensitivityPanel />,
  },
  {
    dataSource: "live",
    id: "validation-report",
    labelZh: "校验报告",
    labelEn: "Validation report",
    render: ({ scene }) => <ValidationReportPanel scene={scene} />,
  },
  {
    dataSource: "live",
    id: "brand-intelligence",
    labelZh: "品牌智能",
    labelEn: "Brand intelligence",
    render: (ctx) => <BrandIntelligencePanel insight={ctx.brandInsight} />,
  },
  {
    dataSource: "fixture",
    id: "scale-readiness",
    labelZh: "规模投影",
    labelEn: "Scale projection",
    render: () => <ScaleReadinessPanel />,
  },
  {
    dataSource: "live",
    id: "project-workspace",
    labelZh: "项目空间",
    labelEn: "Project workspace",
    render: (ctx) => <ProjectWorkspacePanel client={ctx.backendClient} />,
  },
  {
    dataSource: "fixture",
    id: "collaboration-status",
    labelZh: "协作状态",
    labelEn: "Collaboration",
    render: () => <CollaborationStatusPanel />,
  },
  {
    dataSource: "fixture",
    id: "template-library",
    labelZh: "模板库",
    labelEn: "Template library",
    render: () => <TemplateLibraryPanel />,
  },
  {
    dataSource: "fixture",
    id: "ai-workflow",
    labelZh: "脚本与校验",
    labelEn: "Script & validation",
    render: () => <AiWorkflowPanel />,
  },
  {
    dataSource: "fixture",
    id: "image-geometry",
    labelZh: "影像几何",
    labelEn: "Image geometry",
    render: () => <ImageGeometryPanel />,
  },
  {
    dataSource: "fixture",
    id: "tiles-backdrop",
    labelZh: "瓦片底图",
    labelEn: "Tiles backdrop",
    render: () => <TilesBackdropPanel />,
  },
  {
    dataSource: "live",
    id: "trajectory-replay",
    labelZh: "轨迹回放",
    labelEn: "Trajectory replay",
    render: (ctx) => <TrajectoryReplayPanel recording={ctx.trajectoryRecording} />,
  },
];
