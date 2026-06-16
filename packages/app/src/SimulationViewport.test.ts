import { describe, expect, it } from "vitest";
import type { SimulationSnapshot } from "./simulationEngine";
import { selectViewportOverlayAgents } from "./simulationViewportOverlay";

describe("SimulationViewport overlay agent source", () => {
  it("prefers shared-memory overlay agents over structured-clone snapshots", () => {
    const snapshot = createSnapshot([{ id: 1, x: 10, y: 20 }]);

    expect(
      selectViewportOverlayAgents(snapshot, {
        agents: [{ id: 99, x: 2, y: 3 }],
        capacity: 2_000,
      }),
    ).toEqual([{ id: 99, x: 2, y: 3 }]);
  });

  it("falls back to the snapshot when shared-memory overlay agents are absent", () => {
    const snapshot = createSnapshot([{ id: 1, x: 10, y: 20 }]);

    expect(selectViewportOverlayAgents(snapshot, undefined)).toEqual([
      expect.objectContaining({ id: 1, x: 10, y: 20 }),
    ]);
  });
});

function createSnapshot(
  agents: Array<Pick<SimulationSnapshot["agents"][number], "id" | "x" | "y">>,
): SimulationSnapshot {
  return {
    agentCount: agents.length,
    agents: agents.map((agent) => ({
      id: agent.id,
      lifecycleState: "walk",
      targetX: agent.x,
      targetY: agent.y,
      vx: 0,
      vy: 0,
      x: agent.x,
      y: agent.y,
    })),
    elapsedSeconds: 0,
    exitedCount: 0,
    spawnedCount: agents.length,
    status: "running",
    stepCount: 1,
    timeScale: 1,
  };
}
