import type { SimulationAgent } from "./simulationEngine";

export type ViewportWorld = { width: number; height: number };

export type AgentWorldPoint = { x: number; y: number; z: number };

/**
 * Maps a live simulation agent (scene coordinates, Y-down) to viewport world
 * coordinates, matching the scene-object transform used for shops/roads/walls
 * (toRenderX/toRenderY in SimulationViewport): worldX = x - width/2,
 * worldY = height/2 - y. z is the standing height in 3d, 0 in 2d.
 *
 * This is the data the agent InstancedMesh needs to render the REAL moving
 * crowd instead of the static `benchmarkAgentPosition` grid.
 */
export function agentWorldPosition(
  agent: Pick<SimulationAgent, "x" | "y">,
  world: ViewportWorld,
  viewMode: "2d" | "3d",
): AgentWorldPoint {
  return {
    x: agent.x - world.width / 2,
    y: world.height / 2 - agent.y,
    // z is the standing centre: half of the ~1.8m agent height so the figure
    // sits on the z=0 ground plane in 3d; flat on the ground in 2d.
    z: viewMode === "3d" ? 0.9 : 0,
  };
}

/** How many instances to drive from the snapshot, capped at the mesh capacity. */
export function visibleAgentCount(agentCount: number, capacity: number): number {
  if (!Number.isFinite(agentCount)) {
    return 0;
  }
  return Math.max(0, Math.min(Math.floor(agentCount), capacity));
}
