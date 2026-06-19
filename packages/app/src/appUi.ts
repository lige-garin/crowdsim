import type { TranslationKey } from "./i18n";
import type { EvacuationCurvePoint, StageViewMode } from "./AppTypes";

export const milestones: readonly {
  id: string;
  labelKey: TranslationKey;
  statusKey: TranslationKey;
}[] = [
  { id: "T0.1", labelKey: "scaffold", statusKey: "active" },
  { id: "T0.2", labelKey: "wasmBridge", statusKey: "queued" },
  { id: "T0.3", labelKey: "webgpuProbe", statusKey: "queued" },
  { id: "T1.1", labelKey: "sceneSchema", statusKey: "queued" },
];

export const heatmapWindows = [10, 30, 60] as const;

export function curvePointsToSvg(points: EvacuationCurvePoint[]) {
  if (points.length === 0) {
    return "";
  }

  const maxRemaining = Math.max(1, ...points.map((point) => point.remaining));

  return points
    .map((point, index) => {
      const x = points.length === 1 ? 0 : (index / (points.length - 1)) * 120;
      const y = 44 - (point.remaining / maxRemaining) * 40;

      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

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

export function formatStageViewButton(viewMode: StageViewMode, language: "en" | "zh") {
  if (viewMode === "network") {
    return language === "zh" ? "网络" : "Network";
  }

  return viewMode === "3d" ? "3D" : "2D";
}
