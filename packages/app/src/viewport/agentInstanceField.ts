import { resolveDisplayPosition } from "../engine/floorTransferDisplay";
import type { SimulationAgent } from "../engine/simulationEngine";

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

/**
 * Which agent list the crowd renderer should draw. The worker simulation path
 * (default without WebGPU) keeps snapshot.agents empty and streams live
 * positions through the SharedArrayBuffer overlay, so the overlay wins when it
 * has data; otherwise fall back to the main-thread snapshot agents.
 *
 * Regression guard for the bug where the InstancedMesh read the always-empty
 * snapshot.agents and rendered nothing in the worker path.
 */
export type CrowdAgent = Pick<SimulationAgent, "id" | "x" | "y"> & {
  /** From the snapshot path. */
  floorId?: string;
  /** From the shared-memory path, where a floor is an index (ADR-0010). */
  floorIndex?: number;
  /**
   * Where to actually draw this one instead, snapshot-path only (the
   * shared-memory path resolves the same override before it ever reaches
   * this module — `simulationWorkerClient.writeSimulationSharedAgents` —
   * since that buffer has no room to carry two positions). Set for someone
   * riding a stair/escalator/lift (`floorTransferDisplay`), whose own
   * floorId/x/y are the flight's own synthetic id and lane-local
   * coordinates, not a real floor's.
   */
  display?: { floorId: string; x: number; y: number };
};

/** Which floor the stage is showing, in both the forms a crowd arrives in. */
export type ViewedFloor = { id: string; index: number };

/** `agent.display` when set, otherwise `agent` itself unchanged — the one
 * place both paths' "where do I actually draw this" resolves to, so a
 * caller never has to check `display` itself. */
function resolveDisplay(agent: CrowdAgent): CrowdAgent {
  if (agent.display === undefined) {
    return agent;
  }
  return { ...agent, ...resolveDisplayPosition(agent) };
}

export function selectCrowdAgents(
  snapshotAgents: readonly CrowdAgent[] | undefined,
  overlayAgents: readonly CrowdAgent[] | undefined,
  /**
   * Show only the people on this floor. Undefined in a scene with no floors,
   * where everyone is on the one plane.
   */
  floor?: ViewedFloor,
): readonly CrowdAgent[] {
  const chosen =
    overlayAgents && overlayAgents.length > 0 ? overlayAgents : (snapshotAgents ?? []);
  // No allocation on the (overwhelmingly common) frame where nobody is
  // riding a stair/escalator/lift — only `.map()`s, building new objects for
  // the few real riders, when this snapshot actually has one.
  const live = chosen.some((agent) => agent.display !== undefined)
    ? chosen.map(resolveDisplay)
    : chosen;

  if (!floor) {
    return live;
  }

  // The two paths carry a floor differently: the snapshot has the id, the
  // shared buffer an index into the scene's floors. Someone on neither — a
  // scene whose floors changed under a running crowd — is not drawn on a floor
  // that is not theirs.
  return live.filter((agent) =>
    agent.floorIndex === undefined
      ? agent.floorId === floor.id
      : agent.floorIndex === floor.index,
  );
}
