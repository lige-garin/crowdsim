import type { MovementBackendId } from "./movementBackend";
import { simulationRuntimeProfile } from "./simulationEngine";

export type SimulationRuntimeArtifact = {
  decisionBackend: "rule-ts" | "wasm-ready";
  decisionHz: number;
  /**
   * `MovementBackendId`'s own values (`"cpu-compat"` / `"webgpu-ready"`)
   * describe the OLD linear-model consistency probe (`movementBackend.ts`) —
   * `"webgpu-ready"` means "a GPU device reproduced the CPU result on a
   * trivial fixture", never "GPU movement is actually running". `"webgpu"`
   * is the real thing (ADR-0033 stage 3): this run's crowd was genuinely
   * stepped on a GPU device. Kept as a widened union, not folded into
   * `MovementBackendId` itself, so the probe's own type still cannot claim
   * a state it never produces.
   */
  movementBackend: MovementBackendId | "webgpu";
  movementHz: number;
  sharedMemory: "fallback" | "sab";
  thread: "main" | "worker";
};

export function createSimulationRuntimeArtifact(
  overrides: Partial<SimulationRuntimeArtifact> = {},
): SimulationRuntimeArtifact {
  return {
    decisionBackend: "rule-ts",
    decisionHz: simulationRuntimeProfile.decisionHz,
    movementBackend: simulationRuntimeProfile.movementBackend,
    movementHz: simulationRuntimeProfile.movementHz,
    sharedMemory: "fallback",
    thread: "main",
    ...overrides,
  };
}

export function createLiveSimulationRuntimeArtifact(
  overrides: Partial<SimulationRuntimeArtifact> = {},
): SimulationRuntimeArtifact {
  return createSimulationRuntimeArtifact({
    decisionBackend: "wasm-ready",
    sharedMemory: "fallback",
    thread: "worker",
    ...overrides,
  });
}

export function formatSimulationRuntimeArtifact(runtime: SimulationRuntimeArtifact) {
  return [
    `movement=${runtime.movementBackend}@${runtime.movementHz}Hz`,
    `decision=${runtime.decisionBackend}@${runtime.decisionHz}Hz`,
    `thread=${runtime.thread}`,
    `memory=${runtime.sharedMemory}`,
  ].join(" | ");
}
