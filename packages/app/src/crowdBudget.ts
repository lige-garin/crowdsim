/**
 * The crowd scale, declared once.
 *
 * Four independent constants used to decide how many people the app could
 * carry, and nothing tied them together: the engine capped at 2,000, the
 * SharedArrayBuffer had room for 2,000, the instanced renderer allocated 8,192,
 * and the 2D editor overlay silently drew the first 500. Raising one without
 * the others does not fail anywhere — it just makes the picture disagree with
 * the number printed beside it, which is exactly the bug this project already
 * fixed once ("the viewport drew 240 agents and the HUD said 1,800").
 *
 * So they live here, with `crowdBudget.test.ts` asserting the relationships
 * that have to hold. Changing the scale is a change to this file.
 */
export const crowdBudget = {
  /**
   * Engine cap: the simulation stops spawning here. Everything downstream has
   * to be able to carry this many.
   */
  maxAgents: 2_000,

  /**
   * SharedArrayBuffer lanes for the worker -> main agent overlay. Below
   * `maxAgents` the overlay truncates and the viewport disagrees with the HUD.
   */
  sharedCapacity: 2_000,

  /**
   * `InstancedMesh` instances in the 3D viewport. Below `maxAgents` the crowd
   * is silently clipped; far above it, every frame uploads matrices for
   * instances that are never drawn.
   */
  renderCapacity: 8_192,

  /**
   * The 2D editor overlay draws one SVG group per agent, so it samples rather
   * than drawing the whole crowd — ten thousand groups re-rendered per frame is
   * not a thing the DOM can do. This is a real limit, so the overlay says so on
   * screen instead of quietly showing a fraction.
   */
  overlaySample: 500,
} as const;

/**
 * What the 2D overlay should draw, and whether it is showing everyone.
 *
 * Returned together deliberately: the caller cannot render the sample without
 * having the honest count in hand.
 */
export function crowdOverlaySelection(agentCount: number) {
  const drawn = Math.max(
    0,
    Math.min(Math.floor(agentCount), crowdBudget.overlaySample),
  );

  return { drawn, sampled: drawn < agentCount, total: Math.max(0, agentCount) };
}
