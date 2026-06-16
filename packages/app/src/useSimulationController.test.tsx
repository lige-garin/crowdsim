import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseScene } from "@crowdsim/scene-schema";
import type { MovementBackend } from "./movementBackend";
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

  it("uses async movement backend when one is provided", async () => {
    const backend = createOffsetMovementBackend(1, 0);
    const { result, unmount } = renderHook(() =>
      useSimulationController(fastScene, { movementBackend: backend }),
    );

    act(() => {
      result.current.start();
    });
    act(() => {
      rafCallbacks[0](1_000);
      rafCallbacks[1](1_100);
    });

    await waitFor(() => expect(backend.calls).toBeGreaterThan(0));
    await waitFor(() => expect(result.current.snapshot.agentCount).toBeGreaterThan(0));

    expect(result.current.snapshot.agents.some((agent) => agent.x > 0)).toBe(true);

    unmount();
  });

  it("does not reenter async movement ticks while a tick is in flight", async () => {
    const backend = createDeferredMovementBackend();
    const { result, unmount } = renderHook(() =>
      useSimulationController(fastScene, { movementBackend: backend }),
    );

    act(() => {
      result.current.start();
    });
    act(() => {
      rafCallbacks[0](1_000);
      rafCallbacks[1](1_100);
      rafCallbacks[2](1_120);
    });

    await waitFor(() => expect(backend.calls).toBe(1));
    expect(backend.pendingResolves).toHaveLength(1);

    await act(async () => {
      backend.pendingResolves[0]();
    });

    unmount();
  });
});

function createOffsetMovementBackend(offsetX: number, offsetY: number) {
  let calls = 0;
  const backend: MovementBackend & { calls: number } = {
    id: "webgpu-ready",
    mode: "active",
    get calls() {
      return calls;
    },
    step: async ({ agents }) => {
      calls++;
      return offsetAgentPositions(agents.positions, agents.count, offsetX, offsetY);
    },
  };

  return backend;
}

function createDeferredMovementBackend() {
  let calls = 0;
  const pendingResolves: Array<() => void> = [];
  const backend: MovementBackend & {
    calls: number;
    pendingResolves: Array<() => void>;
  } = {
    id: "webgpu-ready",
    mode: "active",
    pendingResolves,
    get calls() {
      return calls;
    },
    step: async ({ agents }) => {
      calls++;
      await new Promise<void>((resolve) => {
        pendingResolves.push(resolve);
      });
      return offsetAgentPositions(agents.positions, agents.count, 1, 0);
    },
  };

  return backend;
}

function offsetAgentPositions(
  sourcePositions: Float32Array,
  count: number,
  offsetX: number,
  offsetY: number,
) {
  const positions = new Float32Array(sourcePositions.length);
  const velocities = new Float32Array(sourcePositions.length);

  for (let index = 0; index < count; index++) {
    positions[index * 2] = sourcePositions[index * 2] + offsetX;
    positions[index * 2 + 1] = sourcePositions[index * 2 + 1] + offsetY;
    velocities[index * 2] = offsetX;
    velocities[index * 2 + 1] = offsetY;
  }

  return { positions, velocities };
}
