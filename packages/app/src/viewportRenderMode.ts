// Which engine path the viewport committed to (ADR-0006): WebGPU drives the full
// experience; without it we run a labeled, scale-limited CPU/WebGL compatibility
// mode rather than degrading silently.
export type ViewportRenderMode = "detecting" | "full-gpu" | "compat" | "unsupported";

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

export type ViewportUnsupportedNotice = {
  title: string;
  reason: string;
  stillWorks: string;
  requirement: string;
  detailsLabel: string;
};

// Copy for the blocking notice shown when no WebGPU adapter is available. The
// mode badge deliberately returns null for `unsupported` (a badge implies the
// viewport is working); this notice replaces the black rectangle instead, so
// the worst state is the one that explains itself best rather than least.
export function describeViewportUnsupported(
  language: "zh" | "en",
): ViewportUnsupportedNotice {
  if (language === "zh") {
    return {
      title: "此设备无法渲染 3D 视口",
      reason: "浏览器未提供可用的 WebGPU 适配器。",
      stillWorks: "场景编辑、2D 平面视图与分析面板不受影响，仍可正常使用。",
      requirement: "需要 Chrome / Edge 113+ 或 Safari 18+，且启用硬件加速。",
      detailsLabel: "技术详情",
    };
  }

  return {
    title: "This device cannot render the 3D viewport",
    reason: "The browser did not provide a usable WebGPU adapter.",
    stillWorks:
      "Scene editing, the 2D plan view and the analysis panels are unaffected.",
    requirement:
      "Requires Chrome / Edge 113+ or Safari 18+ with hardware acceleration enabled.",
    detailsLabel: "Technical details",
  };
}
