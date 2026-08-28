import type { BioCityRenderPrimitive } from "./bioCityRenderPlan";

/**
 * Which render primitives read the simulation clock.
 *
 * The viewport is built in two layers: a structural layer created once per
 * scene (renderer, GPU device, camera, city geometry) and a thin layer rebuilt
 * every few simulated seconds. Getting this partition wrong is expensive in
 * both directions — putting buildings in the dynamic layer rebuilds ~2000
 * meshes per second, putting hazards in the static layer freezes their
 * active/inactive tint — so the rule lives here as a pure, tested function.
 *
 * Only hazards vary: `createBioCityRenderPlan` derives hazard colour and
 * opacity from the active-hazard schedule at `elapsedSeconds`, while roads,
 * buildings and transit stops are identical at every timestamp.
 */
export function isTimeVaryingPrimitive(primitive: BioCityRenderPrimitive): boolean {
  return primitive.kind === "hazard";
}

export type BioCityPrimitiveLayers = {
  dynamic: BioCityRenderPrimitive[];
  static: BioCityRenderPrimitive[];
};

export function partitionBioCityPrimitives(
  primitives: readonly BioCityRenderPrimitive[],
): BioCityPrimitiveLayers {
  const layers: BioCityPrimitiveLayers = { dynamic: [], static: [] };

  for (const primitive of primitives) {
    if (isTimeVaryingPrimitive(primitive)) {
      layers.dynamic.push(primitive);
    } else {
      layers.static.push(primitive);
    }
  }

  return layers;
}
