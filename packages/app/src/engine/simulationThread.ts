export type SimulationThreadInput = {
  /** True only when the ?mainsim debug flag forces the main-thread simulation. */
  forceMainSim: boolean;
};

/**
 * Decides whether the live simulation runs on the worker (default, stable,
 * verified) path. The decision is made ONLY from the stable ?mainsim flag — it
 * must never depend on the async WebGPU probe, because flipping the path after
 * the probe resolves abandons the running worker simulation for a never-started
 * main-thread engine (the "empty city / nobody moving" bug). WebGPU movement is
 * a separate concern owned by SP-1's 100k GPU core, not the path selector.
 */
export function usesWorkerSimulationPath(input: SimulationThreadInput): boolean {
  return !input.forceMainSim;
}
