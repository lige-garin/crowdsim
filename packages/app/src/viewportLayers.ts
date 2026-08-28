/**
 * Which of the viewport's optional layers are drawn.
 *
 * These used to be five `<input type="checkbox" checked readOnly>` in the stage
 * toolbar: permanently ticked, impossible to untick, wired to nothing. Every
 * layer named here is backed by geometry the viewport actually builds, so the
 * toggle either works or the layer does not appear in this list.
 */
export const viewportLayerIds = [
  "crowd",
  "heatmap",
  "flow",
  "risk",
  "weather",
] as const;

export type ViewportLayerId = (typeof viewportLayerIds)[number];

export type ViewportLayers = Record<ViewportLayerId, boolean>;

export const defaultViewportLayers: ViewportLayers = {
  crowd: true,
  flow: true,
  heatmap: true,
  risk: true,
  weather: true,
};

export function toggleViewportLayer(
  layers: ViewportLayers,
  layer: ViewportLayerId,
): ViewportLayers {
  return { ...layers, [layer]: !layers[layer] };
}

export const viewportLayerText: Record<ViewportLayerId, { en: string; zh: string }> = {
  crowd: { en: "Crowd", zh: "人群" },
  flow: { en: "Flow lines", zh: "流线" },
  heatmap: { en: "Heatmap", zh: "热力" },
  risk: { en: "Risk", zh: "风险" },
  weather: { en: "Weather", zh: "天气" },
};

/**
 * Object-name prefix each layer's meshes carry, so the render loop can flip
 * visibility without rebuilding anything. Keeping the mapping here (rather than
 * as string literals sprinkled through the viewport) is what makes the
 * "every layer is backed by real geometry" claim checkable in a test.
 */
export const viewportLayerObjectPrefix: Record<ViewportLayerId, string> = {
  crowd: "layer-crowd",
  flow: "layer-flow",
  heatmap: "layer-heatmap",
  risk: "layer-risk",
  weather: "layer-weather",
};

export function viewportLayerOfObjectName(name: string): ViewportLayerId | undefined {
  return viewportLayerIds.find((layer) =>
    name.startsWith(viewportLayerObjectPrefix[layer]),
  );
}
