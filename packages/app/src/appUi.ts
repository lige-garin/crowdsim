import type { TranslationKey } from "./i18n";
import type { StageViewMode } from "./AppTypes";

export const heatmapWindows = [10, 30, 60] as const;

export function formatSimulationClock(totalSeconds: number) {
  const wholeSeconds = Math.floor(totalSeconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatStageViewMode(
  viewMode: StageViewMode,
  language: "en" | "zh",
  t: (key: TranslationKey) => string,
) {
  if (viewMode === "network") {
    return language === "zh" ? "关系网络" : "Contact network";
  }

  return viewMode === "3d" ? t("view3dPerspective") : t("view2dPlan");
}
