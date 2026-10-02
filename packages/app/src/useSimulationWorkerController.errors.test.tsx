import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoScene } from "./scenes/demoScene";
import type { SimulationSnapshot } from "./engine/simulationEngine";
import { useSimulationWorkerController } from "./useSimulationWorkerController";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  tick: vi.fn(),
}));

function snap(status: SimulationSnapshot["status"]): SimulationSnapshot {
  return {
    agentCount: 0,
    agents: [],
    elapsedSeconds: 0,
    exitedCount: 0,
    spawnedCount: 0,
    status,
    stepCount: 0,
    timeScale: 1,
  };
}

vi.mock("./engine/simulationWorkerClient", async (importActual) => {
  const actual = await importActual<typeof import("./engine/simulationWorkerClient")>();
  return {
    ...actual,
    createSimulationWorkerClient: vi.fn(() => ({
      dispose: vi.fn(),
      init: vi.fn(() => Promise.resolve(snap("paused"))),
      start: mocks.start,
      pause: vi.fn(() => Promise.resolve(snap("paused"))),
      reset: vi.fn(() => Promise.resolve(snap("paused"))),
      setEvacuation: vi.fn(() => Promise.resolve(snap("paused"))),
      setTimeScale: vi.fn(() => Promise.resolve(snap("paused"))),
      snapshot: vi.fn(() => Promise.resolve(snap("paused"))),
      tick: mocks.tick,
    })),
  };
});

describe("useSimulationWorkerController failure reporting", () => {
  beforeEach(() => {
    mocks.start.mockReset();
    mocks.tick.mockReset();
    mocks.tick.mockImplementation(() => Promise.resolve(snap("running")));
  });

  it("reports a failed command instead of dropping the rejection", async () => {
    mocks.start.mockRejectedValue(new Error("worker exploded"));

    const { result, unmount } = renderHook(() =>
      useSimulationWorkerController(demoScene),
    );

    await waitFor(() => expect(result.current.worker.status).toBe("ready"));

    act(() => {
      result.current.start();
    });

    await waitFor(() => expect(result.current.worker.status).toBe("error"));
    expect(result.current.worker.message).toBe("worker exploded");

    unmount();
  });

  it("reports a failed tick", async () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    mocks.start.mockImplementation(() => Promise.resolve(snap("running")));
    mocks.tick.mockRejectedValue(new Error("tick exploded"));

    const { result, unmount } = renderHook(() =>
      useSimulationWorkerController(demoScene),
    );

    await waitFor(() => expect(result.current.worker.status).toBe("ready"));

    act(() => {
      result.current.start();
    });

    await waitFor(() => expect(result.current.snapshot.status).toBe("running"));

    act(() => {
      rafCallbacks[0](1_000);
    });

    await waitFor(() => expect(result.current.worker.status).toBe("error"));
    expect(result.current.worker.message).toBe("tick exploded");

    unmount();
    vi.restoreAllMocks();
  });

  it("recovers from a failure through retry (REVIEW-2026-10-02 P1 #7)", async () => {
    mocks.start.mockRejectedValue(new Error("worker exploded"));

    const { result, unmount } = renderHook(() =>
      useSimulationWorkerController(demoScene),
    );

    await waitFor(() => expect(result.current.worker.status).toBe("ready"));

    act(() => {
      result.current.start();
    });

    await waitFor(() => expect(result.current.worker.status).toBe("error"));

    // Retry steps aside immediately, then the fresh init flips it back to
    // ready — only the re-run init effect can do that.
    act(() => {
      result.current.retry();
    });
    expect(result.current.worker.status).toBe("checking");

    await waitFor(() => expect(result.current.worker.status).toBe("ready"));

    unmount();
  });
});
