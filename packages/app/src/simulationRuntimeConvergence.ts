export type RuntimeConvergenceItem = {
  evidence: string[];
  id:
    | "benchmark-replay-validation"
    | "sab-metrics"
    | "wasm-decision"
    | "webgpu-movement"
    | "worker-thread";
  status: "complete" | "partial";
};

export function createRuntimeConvergenceReport(): RuntimeConvergenceItem[] {
  return [
    {
      evidence: [
        "useWebGpuMovementBackend creates an active backend after CPU/WebGPU alignment",
        "useSimulationController injects movementBackend into the live engine",
        "movementBackend and simulationEngine tests cover active async writes",
      ],
      id: "webgpu-movement",
      status: "complete",
    },
    {
      evidence: [
        "createWasmSimulationDecisionBackend wraps WASM ShopDecisionModel",
        "simulationEngine applies decisions every 10Hz tick",
        "worker init can create its own WASM decision backend",
      ],
      id: "wasm-decision",
      status: "complete",
    },
    {
      evidence: [
        "simulation.worker owns a live SimulationEngine",
        "useSimulationWorkerController is the default App controller when WebGPU movement is not active",
        "worker protocol covers init/start/pause/reset/timeScale/tick/snapshot",
      ],
      id: "worker-thread",
      status: "complete",
    },
    {
      evidence: [
        "simulationWorkerClient creates a SAB metrics header under cross-origin isolation",
        "SAB header covers status, step, agent, spawned, exited, elapsed metrics",
        "Full agent SoA transport is still structured-clone snapshots",
      ],
      id: "sab-metrics",
      status: "partial",
    },
    {
      evidence: [
        "Benchmark results include runtime profile in the reproducibility hash",
        "Trajectory recordings and packed replay preserve runtime profile",
        "App records live trajectory frames from SimulationSnapshot",
        "Credibility report displays runtime profile evidence",
      ],
      id: "benchmark-replay-validation",
      status: "complete",
    },
  ];
}
