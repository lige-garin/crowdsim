import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoScene } from "./scenes/demoScene";
import { useSimulationWorkerController } from "./useSimulationWorkerController";

const wasmMocks = vi.hoisted(() => ({
  createWasmSimulationDecisionBackend: vi.fn(),
}));

vi.mock("./engine/behaviorWasm", () => ({
  createWasmSimulationDecisionBackend: wasmMocks.createWasmSimulationDecisionBackend,
}));

describe("useSimulationWorkerController", () => {
  let originalCrossOriginIsolated: PropertyDescriptor | undefined;
  let originalSharedArrayBuffer: PropertyDescriptor | undefined;
  let originalWorker: typeof Worker | undefined;
  let rafCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    originalCrossOriginIsolated = Object.getOwnPropertyDescriptor(
      globalThis,
      "crossOriginIsolated",
    );
    originalSharedArrayBuffer = Object.getOwnPropertyDescriptor(
      globalThis,
      "SharedArrayBuffer",
    );
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
    restoreGlobalProperty("crossOriginIsolated", originalCrossOriginIsolated);
    restoreGlobalProperty("SharedArrayBuffer", originalSharedArrayBuffer);

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

  it("publishes SAB agent overlay frames for viewport consumers", async () => {
    Object.defineProperty(globalThis, "crossOriginIsolated", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(globalThis, "SharedArrayBuffer", {
      configurable: true,
      value: SharedArrayBuffer,
    });

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

    await waitFor(() =>
      expect(result.current.worker.sharedAgentOverlay?.agents.length).toBeGreaterThan(
        0,
      ),
    );
    expect(result.current.worker.sharedMemory).toBe(true);
    expect(result.current.worker.sharedAgentOverlay).toMatchObject({
      capacity: 2_000,
    });
    expect(result.current.worker.sharedAgentOverlay?.agents[0]).toEqual(
      expect.objectContaining({
        flags: 1,
        id: expect.any(Number),
        x: expect.any(Number),
        y: expect.any(Number),
      }),
    );

    unmount();
  });
});

function restoreGlobalProperty(
  key: "SharedArrayBuffer" | "crossOriginIsolated",
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(globalThis, key, descriptor);
  } else {
    Reflect.deleteProperty(globalThis, key);
  }
}
