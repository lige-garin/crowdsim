import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoScene } from "./demoScene";
import type { SimulationDecisionBackend } from "./simulationDecisionBackend";
import { useWasmSimulationDecisionBackend } from "./useWasmSimulationDecisionBackend";

const wasmMocks = vi.hoisted(() => ({
  createWasmSimulationDecisionBackend: vi.fn(),
}));

vi.mock("./behaviorWasm", () => ({
  createWasmSimulationDecisionBackend: wasmMocks.createWasmSimulationDecisionBackend,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("useWasmSimulationDecisionBackend", () => {
  it("publishes the created WASM decision backend", async () => {
    const backend = createDecisionBackend();

    wasmMocks.createWasmSimulationDecisionBackend.mockResolvedValueOnce(backend);

    const { result } = renderHook(() => useWasmSimulationDecisionBackend(demoScene));

    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(wasmMocks.createWasmSimulationDecisionBackend).toHaveBeenCalledWith(
      demoScene,
    );
    expect(result.current.backend).toBe(backend);
    expect(result.current.message).toContain("live agent targets");
  });

  it("disposes the backend on unmount", async () => {
    const dispose = vi.fn();
    const backend = createDecisionBackend(dispose);

    wasmMocks.createWasmSimulationDecisionBackend.mockResolvedValueOnce(backend);

    const { result, unmount } = renderHook(() =>
      useWasmSimulationDecisionBackend(demoScene),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    unmount();

    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes a backend that resolves after unmount", async () => {
    const dispose = vi.fn();
    const backend = createDecisionBackend(dispose);
    let resolveBackend: (backend: SimulationDecisionBackend) => void = () => undefined;

    wasmMocks.createWasmSimulationDecisionBackend.mockReturnValueOnce(
      new Promise<SimulationDecisionBackend>((resolve) => {
        resolveBackend = resolve;
      }),
    );

    const { unmount } = renderHook(() => useWasmSimulationDecisionBackend(demoScene));

    unmount();
    resolveBackend(backend);

    await waitFor(() => expect(dispose).toHaveBeenCalledTimes(1));
  });
});

function createDecisionBackend(dispose = vi.fn()): SimulationDecisionBackend {
  return {
    decisionHz: 10,
    decideAgents: () => [],
    dispose,
    id: "wasm-ready",
  };
}
