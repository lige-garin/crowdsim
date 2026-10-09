import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { CrowdSimScene } from "@crowdsim/scene-schema";
import {
  createSimulationSharedMemory,
  createSimulationWorkerClient,
  readSimulationSharedAgents,
  readSimulationSharedMemory,
  type SimulationWorkerClient,
  type SimulationWorkerMovementBackendStatus,
  type SimulationWorkerSharedMemory,
} from "./engine/simulationWorkerClient";
import type { SimulationSnapshot } from "./engine/simulationEngine";
import type { SimulationController } from "./useSimulationController";
import { useRunScene } from "./useRunScene";

// The engine keeps its 60 Hz fixed step; one 30 Hz request advances two steps
// and avoids cloning a full agent snapshot into React every display frame.
const workerPublishIntervalMs = 1_000 / 30;

export function shouldAdvanceWorker(lastFrameAt: number | null, frameTime: number) {
  return lastFrameAt === null || frameTime - lastFrameAt >= workerPublishIntervalMs;
}

export type SimulationWorkerControllerState = {
  mode: "inline" | "worker";
  sharedAgentOverlay?: ReturnType<typeof readAgentOverlay>;
  sharedAgentSample?: ReturnType<typeof readAgentSample>;
  sharedMetrics?: ReturnType<typeof readSimulationSharedMemory>;
  sharedMemory: boolean;
  status: "checking" | "error" | "ready";
  message: string;
};

export type SimulationWorkerController = SimulationController & {
  worker: SimulationWorkerControllerState;
  /**
   * ADR-0033 stage 3: which movement backend actually ended up running, and
   * why. `undefined` until the worker's first push arrives (right after
   * `init` resolves). This is real runtime state, not a hardcoded label —
   * the whole point of stage 3's "real switch".
   */
  movementBackend?: SimulationWorkerMovementBackendStatus;
  /**
   * Dispose the (possibly dead) worker and build a fresh one from the current
   * scene. The user-level "retry" behind the simulation-fault card: a crashed
   * worker used to leave no way back short of a page reload.
   */
  retry: () => void;
};

export function useSimulationWorkerController(
  scene: CrowdSimScene,
  options: { requestGpuMovement?: boolean } = {},
): SimulationWorkerController {
  const requestGpuMovement = options.requestGpuMovement ?? false;
  const sharedMemory = useMemo(() => createSimulationSharedMemory(), []);
  const { reinit, runScene } = useRunScene(scene);
  // The newest scene, and the one the engine is actually running. Written by
  // effects declared ABOVE the init effect, so init reads the current values.
  const latestSceneRef = useRef(scene);
  const engineSceneRef = useRef<CrowdSimScene | undefined>(undefined);
  const clientRef = useRef<SimulationWorkerClient | undefined>(undefined);
  const sharedMemoryRef = useRef<SimulationWorkerSharedMemory | undefined>(
    sharedMemory,
  );
  const frameRef = useRef(0);
  const watchdogRef = useRef(0);
  const tickInFlightRef = useRef(false);
  const lastFrameAtRef = useRef<number | null>(null);
  const [snapshot, setSnapshot] = useState<SimulationSnapshot>(() =>
    createEmptySnapshot(),
  );
  const [worker, setWorker] = useState<SimulationWorkerControllerState>({
    message: "Initializing simulation worker",
    mode: typeof Worker === "undefined" ? "inline" : "worker",
    sharedMemory: Boolean(sharedMemory),
    status: "checking",
  });
  const [movementBackend, setMovementBackend] = useState<
    SimulationWorkerMovementBackendStatus | undefined
  >(undefined);
  // Bumped by `retry` below; a change re-runs the init effect, which disposes
  // the old client and builds a fresh worker from the current scene.
  const [retryToken, setRetryToken] = useState(0);
  const retry = useCallback(() => {
    // Flip to "checking" up front so the fault card steps aside for the
    // re-init instead of sitting on "error" until the new worker answers.
    setWorker((current) => ({
      ...current,
      message: "Reinitializing simulation worker",
      status: "checking",
    }));
    setRetryToken((token) => token + 1);
  }, []);
  const publish = useCallback((nextSnapshot: SimulationSnapshot) => {
    setSnapshot(nextSnapshot);
    setWorker((current) => ({
      ...current,
      sharedAgentOverlay: readAgentOverlay(sharedMemoryRef.current),
      sharedAgentSample: readAgentSample(sharedMemoryRef.current),
      sharedMetrics: readMetrics(sharedMemoryRef.current),
    }));
  }, []);
  /**
   * Every command is fire-and-forget from the UI, so a rejected request has
   * nowhere to surface except here. Results from a client that has since been
   * replaced (scene change, StrictMode remount) are dropped rather than reported:
   * disposing that client is what rejected them.
   */
  const runCommand = useCallback(
    (command: (client: SimulationWorkerClient) => Promise<SimulationSnapshot>) => {
      const client = clientRef.current;

      if (!client) {
        return;
      }

      command(client).then(
        (nextSnapshot) => {
          if (clientRef.current === client) {
            publish(nextSnapshot);
          }
        },
        (error: unknown) => {
          if (clientRef.current === client) {
            reportWorkerError(setWorker, error);
          }
        },
      );
    },
    [publish],
  );

  useEffect(() => {
    latestSceneRef.current = scene;
  }, [scene]);

  useEffect(() => {
    let cancelled = false;
    // Init from the newest scene, not `runScene`: after a StrictMode remount,
    // or when a re-init lands after hot edits, the run must include them.
    const initScene = latestSceneRef.current;
    engineSceneRef.current = initScene;
    // Create the worker client INSIDE the effect. React StrictMode runs effects
    // setup -> cleanup -> setup; the cleanup terminates the worker, so a single
    // reused client would be left with a dead worker and every request (start /
    // tick) would hang forever — the simulation never ran. A fresh client per
    // setup always has a live worker.
    const currentClient = createSimulationWorkerClient();
    clientRef.current = currentClient;
    // ADR-0033 stage 3: attached before init, so the very first push (right
    // after init resolves either way) is never missed. `requestGpuMovement`
    // is a stable, caller-decided flag (an explicit URL opt-in, not a
    // reactive probe) — see this hook's own doc comment and
    // `simulationThread.ts`'s "empty city" lesson for why that distinction
    // matters here.
    currentClient.onMovementBackendStatus = (status) => {
      if (cancelled) {
        return;
      }
      setMovementBackend(status);
    };

    currentClient
      .init(initScene, {
        // Use the engine's default mall-crowd decision backend (enter -> shop ->
        // browse -> leave) instead of the generic wasm DES, so the crowd has a
        // reason to move.
        runtime: {
          movementBackend: requestGpuMovement ? "webgpu" : "cpu-compat",
          wasmDecisionBackend: false,
        },
        sharedMemory: sharedMemoryRef.current,
      })
      .then((nextSnapshot) => {
        if (cancelled) {
          return;
        }

        setSnapshot(nextSnapshot);
        setWorker((current) => ({
          ...current,
          message: "Simulation worker ready",
          sharedAgentOverlay: readAgentOverlay(sharedMemoryRef.current),
          sharedAgentSample: readAgentSample(sharedMemoryRef.current),
          sharedMetrics: readMetrics(sharedMemoryRef.current),
          status: "ready",
        }));
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setWorker((current) => ({
          ...current,
          message: error instanceof Error ? error.message : "Simulation worker failed",
          status: "error",
        }));
      });

    return () => {
      cancelled = true;
      // Clear the ref before disposing: dispose rejects the in-flight requests,
      // and those handlers use the ref to tell "my client" from "the client that
      // replaced me".
      if (clientRef.current === currentClient) {
        clientRef.current = undefined;
      }

      currentClient.dispose();
    };
  }, [requestGpuMovement, retryToken, runScene]);

  // Hot scene update (ADR-0007). Declared after the init effect: on a re-init
  // that effect has already recorded the new scene, so this one does nothing.
  useEffect(() => {
    const client = clientRef.current;
    if (!client || engineSceneRef.current === scene) {
      return;
    }
    engineSceneRef.current = scene;
    client.updateScene(scene).then(
      (nextSnapshot) => {
        if (clientRef.current === client) {
          publish(nextSnapshot);
        }
      },
      () => {
        // Refused (or the client died): fall back to the full re-init, which is
        // what every edit did before hot updates existed.
        if (clientRef.current === client) {
          reinit(scene);
        }
      },
    );
  }, [publish, reinit, scene]);

  useEffect(() => {
    if (snapshot.status !== "running" || typeof window === "undefined") {
      return;
    }

    let cancelled = false;

    function currentTime() {
      return typeof performance !== "undefined" ? performance.now() : Date.now();
    }

    function advance(frameTime: number) {
      if (
        cancelled ||
        tickInFlightRef.current ||
        !shouldAdvanceWorker(lastFrameAtRef.current, frameTime)
      ) {
        return;
      }

      const lastFrameAt = lastFrameAtRef.current ?? frameTime;
      const deltaSeconds = (frameTime - lastFrameAt) / 1000;

      const client = clientRef.current;
      if (!client) {
        return;
      }

      lastFrameAtRef.current = frameTime;
      tickInFlightRef.current = true;
      void client
        .tick(deltaSeconds)
        .then(
          (nextSnapshot) => {
            if (!cancelled) {
              publish(nextSnapshot);
            }
          },
          (error: unknown) => {
            // A tick that fails on a live client is a real failure; one that
            // fails because its client was disposed is just the scene changing.
            if (!cancelled && clientRef.current === client) {
              reportWorkerError(setWorker, error);
            }
          },
        )
        .finally(() => {
          tickInFlightRef.current = false;
        });
    }

    function tick(frameTime: number) {
      advance(frameTime);
      frameRef.current = window.requestAnimationFrame(tick);
    }

    if (window.requestAnimationFrame) {
      frameRef.current = window.requestAnimationFrame(tick);
    }

    watchdogRef.current = window.setInterval(() => {
      const frameTime = currentTime();

      if (lastFrameAtRef.current === null || frameTime - lastFrameAtRef.current > 120) {
        advance(frameTime);
      }
    }, 1000 / 30);

    return () => {
      cancelled = true;
      if (window.cancelAnimationFrame) {
        window.cancelAnimationFrame(frameRef.current);
      }

      window.clearInterval(watchdogRef.current);
    };
  }, [publish, snapshot.status, snapshot.timeScale]);

  const start = useCallback(() => {
    lastFrameAtRef.current = null;
    runCommand((client) => client.start());
  }, [runCommand]);

  const pause = useCallback(() => {
    runCommand((client) => client.pause());
  }, [runCommand]);

  const reset = useCallback(() => {
    lastFrameAtRef.current = null;
    runCommand((client) => client.reset());
  }, [runCommand]);

  const setTimeScale = useCallback(
    (timeScale: number) => {
      runCommand((client) => client.setTimeScale(timeScale));
    },
    [runCommand],
  );

  const setEvacuation = useCallback(
    (active: boolean) => {
      runCommand((client) => client.setEvacuation(active));
    },
    [runCommand],
  );

  return {
    movementBackend,
    pause,
    reset,
    retry,
    setEvacuation,
    setTimeScale,
    snapshot,
    start,
    worker,
  };
}

function reportWorkerError(
  setWorker: Dispatch<SetStateAction<SimulationWorkerControllerState>>,
  error: unknown,
) {
  setWorker((current) => ({
    ...current,
    message: error instanceof Error ? error.message : "Simulation worker failed",
    status: "error",
  }));
}

function readMetrics(sharedMemory: SimulationWorkerSharedMemory | undefined) {
  return sharedMemory ? readSimulationSharedMemory(sharedMemory) : undefined;
}

function readAgentSample(sharedMemory: SimulationWorkerSharedMemory | undefined) {
  if (!sharedMemory) {
    return undefined;
  }

  const frame = readSimulationSharedAgents(sharedMemory);

  return {
    firstAgentId: frame.agents[0]?.id ?? null,
    sharedAgentCount: frame.agents.length,
    capacity: frame.capacity,
  };
}

/**
 * Live agent positions for the viewport.
 *
 * This used to pass an explicit `limit` of 240 while the shared buffer holds
 * 2,000 agents and the HUD printed `snapshot.agentCount` — so the readout said
 * 1,800 while the viewport drew 240 people. Reading the whole frame (the
 * default limit is the buffer capacity) makes the number and the picture agree.
 */
function readAgentOverlay(sharedMemory: SimulationWorkerSharedMemory | undefined) {
  return sharedMemory ? readSimulationSharedAgents(sharedMemory) : undefined;
}

function createEmptySnapshot(): SimulationSnapshot {
  return {
    agentCount: 0,
    agents: [],
    elapsedSeconds: 0,
    exitedCount: 0,
    spawnedCount: 0,
    status: "paused" as const,
    stepCount: 0,
    timeScale: 1,
  };
}
