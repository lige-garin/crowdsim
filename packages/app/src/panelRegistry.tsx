import type { ReactNode } from "react";
import type { TrajectoryRecording } from "./trajectoryRecording";

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

// Panels are registered in SP-5a Tasks 2-5. Empty here by design.
export const panelRegistry: PanelRegistryEntry[] = [];
