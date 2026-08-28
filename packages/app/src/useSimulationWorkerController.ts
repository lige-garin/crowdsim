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
  type SimulationWorkerSharedMemory,
} from "./simulationWorkerClient";
import type { SimulationSnapshot } from "./simulationEngine";
import type { SimulationController } from "./useSimulationController";

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
};

export function useSimulationWorkerController(
  scene: CrowdSimScene,
): SimulationWorkerController {
  const sharedMemory = useMemo(() => createSimulationSharedMemory(), []);
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
    let cancelled = false;
    // Create the worker client INSIDE the effect. React StrictMode runs effects
    // setup -> cleanup -> setup; the cleanup terminates the worker, so a single
    // reused client would be left with a dead worker and every request (start /
    // tick) would hang forever — the simulation never ran. A fresh client per
    // setup always has a live worker.
    const currentClient = createSimulationWorkerClient();
    clientRef.current = currentClient;

    currentClient
      .init(scene, {
        // Use the engine's default mall-crowd decision backend (enter -> shop ->
        // browse -> leave) instead of the generic wasm DES, so the crowd has a
        // reason to move.
        runtime: { wasmDecisionBackend: false },
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
  }, [scene]);

  useEffect(() => {
    if (snapshot.status !== "running" || typeof window === "undefined") {
      return;
    }

    let cancelled = false;

    function currentTime() {
      return typeof performance !== "undefined" ? performance.now() : Date.now();
    }

    function advance(frameTime: number) {
      if (cancelled || tickInFlightRef.current) {
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
    pause,
    reset,
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
