import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoScene } from "./demoScene";
import type { SimulationSnapshot } from "./simulationEngine";
import { useSimulationWorkerController } from "./useSimulationWorkerController";

const created = vi.hoisted(() => ({ clients: [] as Array<{ disposed: boolean }> }));

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

vi.mock("./simulationWorkerClient", async (importActual) => {
  const actual = await importActual<typeof import("./simulationWorkerClient")>();
  return {
    ...actual,
    // A client whose worker "dies" on dispose: after dispose every request hangs
    // forever, exactly like posting to a terminated Worker. This is what made the
    // reused-client bug invisible (no error, just a stuck simulation).
    createSimulationWorkerClient: vi.fn(() => {
      const state = { disposed: false };
      created.clients.push(state);
      const hang = <T,>(value: T) =>
        state.disposed ? new Promise<T>(() => {}) : Promise.resolve(value);
      return {
        dispose: vi.fn(() => {
          state.disposed = true;
        }),
        init: vi.fn(() => hang(snap("paused"))),
        start: vi.fn(() => hang(snap("running"))),
        pause: vi.fn(() => hang(snap("paused"))),
        reset: vi.fn(() => hang(snap("paused"))),
        setTimeScale: vi.fn(() => hang(snap("paused"))),
        snapshot: vi.fn(() => hang(snap("paused"))),
        tick: vi.fn(() => hang(snap("running"))),
      };
    }),
  };
});

describe("useSimulationWorkerController under StrictMode", () => {
  beforeEach(() => {
    created.clients.length = 0;
  });

  it("creates a fresh worker per effect setup so a remount is not stuck on a disposed worker", async () => {
    const { result } = renderHook(() => useSimulationWorkerController(demoScene), {
      wrapper: StrictMode,
    });

    await waitFor(() => expect(result.current.worker.status).toBe("ready"));

    act(() => {
      result.current.start();
    });

    await waitFor(() => expect(result.current.snapshot.status).toBe("running"));

    // StrictMode ran setup -> cleanup -> setup; the first client was disposed,
    // so a fresh one must have been created for the live setup.
    expect(created.clients.length).toBeGreaterThanOrEqual(2);
    expect(created.clients[0].disposed).toBe(true);
  });
});
