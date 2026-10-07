import type { CrowdSimScene } from "@crowdsim/scene-schema";
import type { ReactNode } from "react";
import type { TrajectoryRecording } from "../analytics/trajectoryRecording";
import type { BrandDecisionInsight } from "../brandDecisionProbe";
import { ScenarioDiffPanel } from "./ScenarioDiffPanel";
import { ExperimentSweepPanel } from "./ExperimentSweepPanel";
import { SensitivityPanel } from "./SensitivityPanel";
import { RimeaReportPanel } from "./RimeaReportPanel";
import { ValidationReportPanel } from "./ValidationReportPanel";
import { BrandIntelligencePanel } from "./BrandIntelligencePanel";
import { TemplateLibraryPanel } from "./TemplateLibraryPanel";
import { TrajectoryReplayPanel } from "./TrajectoryReplayPanel";
import { WeatherPanel } from "./WeatherPanel";
import { ShopLayoutPanel } from "./ShopLayoutPanel";
import { LayoutComparePanel } from "./LayoutComparePanel";

export type PanelDockContext = {
  /** The scene the app is running, for panels that report on the user's own project. */
  scene: CrowdSimScene;
  trajectoryRecording: TrajectoryRecording;
  brandInsight?: BrandDecisionInsight;
  /** Only present for panels that actually mutate the open scene (currently
   * just WeatherPanel) — every other panel here is read-only by design. */
  onApplyScene?: (scene: CrowdSimScene) => void;
};

/**
 * Where a panel's numbers come from.
 *
 * `live` reads the running simulation. `fixture` builds its own hardcoded
 * scenario in a useMemo and is unrelated to whatever the user currently has
 * open -- RimeaReportPanel, for instance, always runs the RiMEA corridor
 * fixtures, whatever scene the app is actually running. The dock labels
 * every fixture panel, because a panel that looks authoritative and
 * describes someone else's scene is worse than no panel.
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
    // Keyed by scene id: a fresh mount on scene change gives the panel's
    // async benchmark state a clean reset for free, rather than an effect
    // reaching back to reset it (see ValidationReportPanel.tsx's own note).
    render: ({ scene }) => <ValidationReportPanel key={scene.id} scene={scene} />,
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
  {
    dataSource: "live",
    id: "shop-layout",
    labelZh: "店铺布局",
    labelEn: "Shop layout",
    // Reads the open scene's shops and, when wired to onApplyScene, writes
    // the planned furniture back into it.
    // Keyed by scene id, same reason as ValidationReportPanel above: the form
    // holds the selected shop and the typed fields, and without a fresh mount
    // those carry over to whichever scene comes next — the new scene's first
    // shop then gets the old shop's name and table mix.
    render: (ctx) => (
      <ShopLayoutPanel
        key={ctx.scene.id}
        scene={ctx.scene}
        onApplyScene={ctx.onApplyScene}
      />
    ),
  },
  {
    dataSource: "live",
    id: "layout-compare",
    labelZh: "方案对比",
    labelEn: "Layout comparison",
    // Keyed by scene id: a report left on screen was measured from the scene
    // that was open when it ran. Keeping it under the next scene's name would
    // be a number about one scene sitting under another.
    render: (ctx) => <LayoutComparePanel key={ctx.scene.id} scene={ctx.scene} />,
  },
  {
    dataSource: "live",
    id: "weather",
    labelZh: "实时天气",
    labelEn: "Live weather",
    render: (ctx) => <WeatherPanel scene={ctx.scene} onApplyScene={ctx.onApplyScene} />,
  },
];
