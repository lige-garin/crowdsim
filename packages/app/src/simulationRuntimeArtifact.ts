import type { MovementBackendId } from "./movementBackend";
import { simulationRuntimeProfile } from "./simulationEngine";

export type SimulationRuntimeArtifact = {
  decisionBackend: "rule-ts" | "wasm-ready";
  decisionHz: number;
  movementBackend: MovementBackendId;
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

export function formatSimulationRuntimeArtifact(runtime: SimulationRuntimeArtifact) {
  return [
    `movement=${runtime.movementBackend}@${runtime.movementHz}Hz`,
    `decision=${runtime.decisionBackend}@${runtime.decisionHz}Hz`,
    `thread=${runtime.thread}`,
    `memory=${runtime.sharedMemory}`,
  ].join(" | ");
}
