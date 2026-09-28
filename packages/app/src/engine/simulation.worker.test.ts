import { afterEach, describe, expect, it, vi } from "vitest";
import { demoScene } from "../scenes/demoScene";
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

      // init also pushes a movement-backend-status message (ADR-0033 stage
      // 3, unrelated to what this test checks) -- filter to the two
      // request/response snapshots this test actually cares about.
      await vi.waitFor(() =>
        expect(responses.filter((r) => r.type === "snapshot")).toHaveLength(2),
      );

      const snapshots = responses.filter((r) => r.type === "snapshot");
      expect(snapshots[1]).toMatchObject({ id: 2 });
      expect(
        snapshots[1].type === "snapshot" ? snapshots[1].snapshot.status : undefined,
      ).toBe("running");
    } finally {
      scope.postMessage = originalPostMessage;
    }
  });

  it("ADR-0033 stage 3: pushes a movement-backend-status of cpu-compat after a normal init (no webgpu requested)", async () => {
    const responses: SimulationWorkerResponse[] = [];
    const originalPostMessage = scope.postMessage;
    scope.postMessage = (message) => responses.push(message);

    try {
      vi.resetModules();
      await import("./simulation.worker");

      scope.onmessage?.({
        data: { id: 1, type: "init", scene: demoScene },
      } as MessageEvent<SimulationWorkerRequest>);

      await vi.waitFor(() =>
        expect(responses.some((r) => r.type === "movement-backend-status")).toBe(true),
      );

      const status = responses.find((r) => r.type === "movement-backend-status");
      expect(status).toMatchObject({ active: "cpu-compat" });
    } finally {
      scope.postMessage = originalPostMessage;
    }
  });

  it("ADR-0033 stage 3: requesting webgpu with no navigator.gpu available (this test environment) falls back to cpu-compat rather than failing init", async () => {
    const responses: SimulationWorkerResponse[] = [];
    const originalPostMessage = scope.postMessage;
    scope.postMessage = (message) => responses.push(message);

    try {
      vi.resetModules();
      await import("./simulation.worker");

      scope.onmessage?.({
        data: {
          id: 1,
          type: "init",
          scene: demoScene,
          runtime: { movementBackend: "webgpu" },
        },
      } as MessageEvent<SimulationWorkerRequest>);

      await vi.waitFor(() =>
        expect(responses.some((r) => r.type === "snapshot")).toBe(true),
      );
      await vi.waitFor(() =>
        expect(responses.some((r) => r.type === "movement-backend-status")).toBe(true),
      );

      // init itself succeeded (a snapshot came back), and the honest status
      // push says webgpu was NOT actually achieved -- not silence, and not
      // a thrown error that would have failed the whole init.
      expect(responses.some((r) => r.type === "error")).toBe(false);
      const status = responses.find((r) => r.type === "movement-backend-status");
      expect(status).toMatchObject({ active: "cpu-compat" });
      expect(status && "message" in status ? status.message : undefined).toMatch(
        /unavailable/,
      );
    } finally {
      scope.postMessage = originalPostMessage;
    }
  });
});
