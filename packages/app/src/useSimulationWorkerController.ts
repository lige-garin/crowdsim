import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const client = useMemo(() => createSimulationWorkerClient(), []);
  const sharedMemory = useMemo(() => createSimulationSharedMemory(), []);
  const clientRef = useRef<SimulationWorkerClient>(client);
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
      sharedAgentSample: readAgentSample(sharedMemoryRef.current),
      sharedMetrics: readMetrics(sharedMemoryRef.current),
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const currentClient = clientRef.current;

    currentClient
      .init(scene, {
        runtime: { wasmDecisionBackend: true },
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

      lastFrameAtRef.current = frameTime;
      tickInFlightRef.current = true;
      void clientRef.current
        .tick(deltaSeconds)
        .then((nextSnapshot) => {
          if (!cancelled) {
            publish(nextSnapshot);
          }
        })
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
    void clientRef.current.start().then(publish);
  }, [publish]);

  const pause = useCallback(() => {
    void clientRef.current.pause().then(publish);
  }, [publish]);

  const reset = useCallback(() => {
    lastFrameAtRef.current = null;
    void clientRef.current.reset().then(publish);
  }, [publish]);

  const setTimeScale = useCallback(
    (timeScale: number) => {
      void clientRef.current.setTimeScale(timeScale).then(publish);
    },
    [publish],
  );

  return {
    pause,
    reset,
    setTimeScale,
    snapshot,
    start,
    worker,
  };
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
