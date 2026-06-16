import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoScene } from "./demoScene";
import { useSimulationWorkerController } from "./useSimulationWorkerController";

const wasmMocks = vi.hoisted(() => ({
  createWasmSimulationDecisionBackend: vi.fn(),
}));

vi.mock("./behaviorWasm", () => ({
  createWasmSimulationDecisionBackend: wasmMocks.createWasmSimulationDecisionBackend,
}));

describe("useSimulationWorkerController", () => {
  let originalWorker: typeof Worker | undefined;
  let rafCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    originalWorker = globalThis.Worker;
    Reflect.deleteProperty(globalThis, "Worker");
    wasmMocks.createWasmSimulationDecisionBackend.mockResolvedValue({
      decisionHz: 10,
      decideAgents: vi.fn(() => []),
      dispose: vi.fn(),
      id: "wasm-ready",
    });
    rafCallbacks = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (originalWorker) {
      Object.defineProperty(globalThis, "Worker", {
        configurable: true,
        value: originalWorker,
      });
    } else {
      Reflect.deleteProperty(globalThis, "Worker");
    }

    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("runs the live simulation through the worker controller fallback", async () => {
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
      rafCallbacks[1](1_300);
    });

    await waitFor(() => expect(result.current.snapshot.stepCount).toBeGreaterThan(0));
    expect(result.current.worker.mode).toBe("inline");
    expect(result.current.worker.sharedMemory).toBe(false);

    unmount();
  });
});
