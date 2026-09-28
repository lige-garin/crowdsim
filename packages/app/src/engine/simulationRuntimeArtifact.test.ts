import { describe, expect, it } from "vitest";
import {
  createLiveSimulationRuntimeArtifact,
  createSimulationRuntimeArtifact,
  formatSimulationRuntimeArtifact,
} from "./simulationRuntimeArtifact";

describe("simulation runtime artifact", () => {
  it("keeps the deterministic benchmark fallback profile explicit", () => {
    expect(createSimulationRuntimeArtifact()).toEqual({
      decisionBackend: "rule-ts",
      decisionHz: 10,
      movementBackend: "cpu-compat",
      movementHz: 60,
      sharedMemory: "fallback",
      thread: "main",
    });
  });

  it("models the phase 2 live runtime as worker WASM with optional shared memory", () => {
    const runtime = createLiveSimulationRuntimeArtifact({
      movementBackend: "webgpu-ready",
      sharedMemory: "sab",
      thread: "main",
    });

    expect(runtime).toEqual({
      decisionBackend: "wasm-ready",
      decisionHz: 10,
      movementBackend: "webgpu-ready",
      movementHz: 60,
      sharedMemory: "sab",
      thread: "main",
    });
    expect(formatSimulationRuntimeArtifact(runtime)).toBe(
      "movement=webgpu-ready@60Hz | decision=wasm-ready@10Hz | thread=main | memory=sab",
    );
  });
});
