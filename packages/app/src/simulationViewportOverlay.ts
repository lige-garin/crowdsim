import type { SimulationSnapshot } from "./simulationEngine";

export type ViewportAgentOverlayFrame = {
  agents: Array<{
    id: number;
    x: number;
    y: number;
  }>;
  capacity: number;
};

export function selectViewportOverlayAgents(
  snapshot?: SimulationSnapshot,
  sharedAgentOverlay?: ViewportAgentOverlayFrame,
) {
  return sharedAgentOverlay && sharedAgentOverlay.agents.length > 0
    ? sharedAgentOverlay.agents
    : (snapshot?.agents.slice(0, 240) ?? []);
}
