import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseScene } from "@crowdsim/scene-schema";
import type { SimulationDecisionBackend } from "./simulationDecisionBackend";
import { useSimulationController } from "./useSimulationController";

const fastScene = parseScene({
  schemaVersion: "1.0.0",
  id: "controller-fast-scene",
  name: "Controller Fast Scene",
  units: "meters",
  seed: 41,
  world: { width: 20, height: 10 },
  walls: [],
  entrances: [
    {
      id: "entry",
      kind: "source",
      position: { x: 0, y: 5 },
      width: 0.1,
      arrivalRatePerMinute: 600_000,
    },
    {
      id: "exit",
      kind: "sink",
      position: { x: 18, y: 5 },
      width: 1,
      arrivalRatePerMinute: 0,
    },
  ],
  areas: [],
  targets: [],
  shops: [],
  servicePoints: [],
  countLines: [],
});

describe("useSimulationController", () => {
  let rafCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    rafCallbacks = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies injected decision backend output during live controller ticks", async () => {
    const decisionBackend = createDecisionBackend();
    const { result, unmount } = renderHook(() =>
      useSimulationController(fastScene, { decisionBackend }),
    );

    act(() => {
      result.current.start();
    });
    act(() => {
      rafCallbacks[0](1_000);
      rafCallbacks[1](1_200);
    });

    await waitFor(() => expect(decisionBackend.calls).toBeGreaterThan(0));
    await waitFor(() =>
      expect(
        result.current.snapshot.agents.some(
          (agent) =>
            agent.lifecycleState === "enterStore" &&
            agent.selectedStoreId === "shop-a" &&
            agent.targetX === 3 &&
            agent.targetY === 4,
        ),
      ).toBe(true),
    );

    unmount();
  });
});

function createDecisionBackend() {
  let calls = 0;
  const backend: SimulationDecisionBackend & { calls: number } = {
    decisionHz: 10,
    id: "wasm-ready",
    get calls() {
      return calls;
    },
    decideAgents: ({ agents }) => {
      calls++;

      return agents.map((agent) => ({
        agentId: agent.id,
        nextState: "enterStore",
        selectedStoreId: "shop-a",
        target: { x: 3, y: 4 },
      }));
    },
  };

  return backend;
}
