import { afterEach, describe, expect, it, vi } from "vitest";
import { demoScene } from "./demoScene";
import type {
  SimulationWorkerRequest,
  SimulationWorkerResponse,
} from "./simulationWorkerClient";

const wasmMocks = vi.hoisted(() => ({
  createWasmSimulationDecisionBackend: vi.fn(),
}));

vi.mock("./behaviorWasm", () => ({
  createWasmSimulationDecisionBackend: wasmMocks.createWasmSimulationDecisionBackend,
}));

type WorkerScope = {
  onmessage: ((event: MessageEvent<SimulationWorkerRequest>) => void) | null;
  postMessage: (message: SimulationWorkerResponse) => void;
};

const scope = globalThis as unknown as WorkerScope;

describe("simulation worker", () => {
  afterEach(() => {
    scope.onmessage = null;
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("answers commands that arrive while init is still loading", async () => {
    const responses: SimulationWorkerResponse[] = [];
    const originalPostMessage = scope.postMessage;
    scope.postMessage = (message) => responses.push(message);
    wasmMocks.createWasmSimulationDecisionBackend.mockResolvedValue({
      decisionHz: 10,
      decideAgents: () => [],
      id: "wasm-ready",
    });

    try {
      vi.resetModules();
      await import("./simulation.worker");

      const post = (message: SimulationWorkerRequest) =>
        scope.onmessage?.({ data: message } as MessageEvent<SimulationWorkerRequest>);

      // `init` awaits a dynamic import; the command posted in the same task used
      // to overtake it and come back as "not initialized".
      post({
        id: 1,
        type: "init",
        scene: demoScene,
        runtime: { wasmDecisionBackend: true },
      });
      post({ id: 2, type: "start" });

      await vi.waitFor(() => expect(responses).toHaveLength(2));

      expect(responses.map((response) => response.type)).toEqual([
        "snapshot",
        "snapshot",
      ]);
      expect(responses[1]).toMatchObject({ id: 2 });
      expect(
        responses[1].type === "snapshot" ? responses[1].snapshot.status : undefined,
      ).toBe("running");
    } finally {
      scope.postMessage = originalPostMessage;
    }
  });
});
