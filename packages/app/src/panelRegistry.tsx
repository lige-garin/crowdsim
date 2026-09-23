import type { CrowdSimScene } from "@crowdsim/scene-schema";
import type { ReactNode } from "react";
import type { TrajectoryRecording } from "./trajectoryRecording";
import type { BrandDecisionInsight } from "./brandDecisionProbe";
import { ScenarioComparisonPanel } from "./ScenarioComparisonPanel";
import { ScenarioDiffPanel } from "./ScenarioDiffPanel";
import { ExperimentSweepPanel } from "./ExperimentSweepPanel";
import { SensitivityPanel } from "./SensitivityPanel";
import { RimeaReportPanel } from "./RimeaReportPanel";
import { ExperimentSummaryPanel } from "./ExperimentSummaryPanel";
import { ValidationReportPanel } from "./ValidationReportPanel";
import { BrandIntelligencePanel } from "./BrandIntelligencePanel";
import { ScaleReadinessPanel } from "./ScaleReadinessPanel";
import { TemplateLibraryPanel } from "./TemplateLibraryPanel";
import { TrajectoryReplayPanel } from "./TrajectoryReplayPanel";

export type PanelDockContext = {
  /** The scene the app is running, for panels that report on the user's own project. */
  scene: CrowdSimScene;
  trajectoryRecording: TrajectoryRecording;
  brandInsight?: BrandDecisionInsight;
};

/**
 * Where a panel's numbers come from.
 *
 * `live` reads the running simulation. `fixture` builds its own hardcoded
 * scenario in a useMemo and is unrelated to whatever the user currently has
 * open -- ScaleReadiness, for instance, reports on `demoScene` (an atrium)
 * while the app runs the rainy high street. The dock labels every fixture
 * panel, because a panel that looks authoritative and describes someone
 * else's scene is worse than no panel.
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
    dataSource: "fixture",
    id: "template-library",
    labelZh: "模板库",
    labelEn: "Template library",
    render: () => <TemplateLibraryPanel />,
  },
  {
    dataSource: "live",
    id: "trajectory-replay",
    labelZh: "轨迹回放",
    labelEn: "Trajectory replay",
    render: (ctx) => <TrajectoryReplayPanel recording={ctx.trajectoryRecording} />,
  },
];
