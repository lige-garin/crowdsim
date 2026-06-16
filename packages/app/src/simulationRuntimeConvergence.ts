export type RuntimeConvergenceItem = {
  blocksFinalUi: boolean;
  completionPercent: number;
  evidence: string[];
  id:
    | "benchmark-replay-validation"
    | "sab-metrics"
    | "wasm-decision"
    | "webgpu-movement"
    | "worker-thread";
  limitations: string[];
  status: "complete" | "partial";
};

export type RuntimeConvergenceAudit = {
  blocksFinalUi: boolean;
  completeCount: number;
  completionPercent: number;
  itemCount: number;
  remainingBlockers: string[];
};

export function createRuntimeConvergenceReport(): RuntimeConvergenceItem[] {
  return [
    {
      blocksFinalUi: false,
      completionPercent: 100,
      evidence: [
        "useWebGpuMovementBackend creates an active backend after CPU/WebGPU alignment",
        "useSimulationController injects movementBackend into the live engine",
        "movementBackend and simulationEngine tests cover active async writes",
      ],
      id: "webgpu-movement",
      limitations: [
        "WebGPU movement is an optional active path; unsupported browsers keep the CPU-compatible worker path.",
      ],
      status: "complete",
    },
    {
      blocksFinalUi: false,
      completionPercent: 100,
      evidence: [
        "createWasmSimulationDecisionBackend wraps WASM ShopDecisionModel",
        "simulationEngine applies decisions every 10Hz tick",
        "worker init can create its own WASM decision backend",
      ],
      id: "wasm-decision",
      limitations: [],
      status: "complete",
    },
    {
      blocksFinalUi: false,
      completionPercent: 100,
      evidence: [
        "simulation.worker owns a live SimulationEngine",
        "useSimulationWorkerController is the default App controller when WebGPU movement is not active",
        "worker protocol covers init/start/pause/reset/timeScale/tick/snapshot",
      ],
      id: "worker-thread",
      limitations: [
        "GPUDevice is not structured-cloned into the worker path; WebGPU movement stays on the main-thread controller when active.",
      ],
      status: "complete",
    },
    {
      blocksFinalUi: false,
      completionPercent: 100,
      evidence: [
        "simulationWorkerClient creates a SAB metrics header and agent SoA lanes under cross-origin isolation",
        "SAB header covers status, step, agent, spawned, exited, elapsed, capacity, and version metrics",
        "Agent SoA lanes cover id, behavior state, flags, position, velocity, and target coordinates",
        "useSimulationWorkerController reads shared agent count and capacity from SAB for live runtime status",
        "SimulationViewport can draw its 2D live agent overlay from SAB agent frames",
      ],
      id: "sab-metrics",
      limitations: [
        "Structured-clone snapshots remain the authoritative full React state path; SAB is the fast-read evidence and overlay channel.",
      ],
      status: "complete",
    },
    {
      blocksFinalUi: false,
      completionPercent: 100,
      evidence: [
        "Benchmark results include runtime profile in the reproducibility hash",
        "Trajectory recordings and packed replay preserve runtime profile",
        "createLiveSimulationRuntimeArtifact models phase 2 live worker/WASM runtime evidence",
        "App records live trajectory frames from SimulationSnapshot",
        "Credibility report displays runtime profile evidence",
      ],
      id: "benchmark-replay-validation",
      limitations: [],
      status: "complete",
    },
  ];
}

export function createRuntimeConvergenceAudit(
  report = createRuntimeConvergenceReport(),
): RuntimeConvergenceAudit {
  const completeCount = report.filter((item) => item.status === "complete").length;
  const remainingBlockers = report
    .filter((item) => item.blocksFinalUi || item.status !== "complete")
    .map((item) => item.id);

  return {
    blocksFinalUi: remainingBlockers.length > 0,
    completeCount,
    completionPercent:
      report.length > 0
        ? Math.round(
            report.reduce((sum, item) => sum + item.completionPercent, 0) /
              report.length,
          )
        : 0,
    itemCount: report.length,
    remainingBlockers,
  };
}
