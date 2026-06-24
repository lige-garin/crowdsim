// Which engine path the viewport committed to (ADR-0006): WebGPU drives the full
// experience; without it we run a labeled, scale-limited CPU/WebGL compatibility
// mode rather than degrading silently.
export type ViewportRenderMode =
  | "detecting"
  | "full-gpu"
  | "compat"
  | "unsupported";

// Pure, testable mapping from render mode to its HUD label. Returns null when no
// badge should be shown (still detecting, or unsupported -- the status line covers
// that case). Compat mode carries an honesty caveat: it is preview/edit only.
export function describeViewportRenderMode(
  mode: ViewportRenderMode,
  language: "zh" | "en",
): { label: string; caveat?: string } | null {
  if (mode === "full-gpu") {
    return { label: language === "zh" ? "完整 GPU 模式" : "Full GPU mode" };
  }

  if (mode === "compat") {
    return {
      label:
        language === "zh"
          ? "兼容模式 · CPU · 规模受限"
          : "Compatibility mode · CPU · scale-limited",
      caveat:
        language === "zh"
          ? "预览/编辑用，小规模，非校准分析"
          : "Preview/edit only — small-scale, not calibrated analysis",
    };
  }

  return null;
}
