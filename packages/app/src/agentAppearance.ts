export type ViewMode = "2d" | "3d";

export type AgentAppearance = {
  /** 3d: box width(x)/depth(y)/height(z) in metres. 2d: plane width/height in x/y. */
  size: { x: number; y: number; z: number };
  /** Base (diffuse) colour. */
  color: string;
  /** Self-illumination colour; keeps figures lit where the key light does not reach. */
  emissive: string;
  /** 0 = no self-illumination (flat 2d plane); >0 makes 3d figures glow. */
  emissiveIntensity: number;
};

/**
 * Visual description of a crowd agent instance.
 *
 * The 3d camera frames the entire 160x96 world from ~96 units away, so a
 * realistic 0.7m-wide figure renders as a few pixels and visually disappears
 * (see baseline: HUD reports agents but the viewport shows none). The crowd
 * must read as people at that distance, so 3d figures are widened past human
 * scale and given a warm self-illuminated colour that stands out from the cool,
 * pale scene. 2d (top-down) keeps its existing flat marker.
 */
export function agentAppearance(viewMode: ViewMode): AgentAppearance {
  if (viewMode === "3d") {
    return {
      size: { x: 1.5, y: 1.5, z: 1.8 },
      color: "#ffb43c",
      emissive: "#ff7a14",
      emissiveIntensity: 0.85,
    };
  }
  return {
    size: { x: 1, y: 1, z: 0 },
    color: "#2f6f63",
    emissive: "#000000",
    emissiveIntensity: 0,
  };
}
