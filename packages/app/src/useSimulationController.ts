import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CrowdSimScene } from "@crowdsim/scene-schema";
import {
  createSimulationEngineFromScene,
  type SimulationSnapshot,
} from "./simulationEngine";
import type { SimulationDecisionBackend } from "./simulationDecisionBackend";
import type { MovementBackend } from "./movementBackend";

export type SimulationController = {
  pause: () => void;
  reset: () => void;
  setEvacuation: (active: boolean) => void;
  setTimeScale: (timeScale: number) => void;
  snapshot: SimulationSnapshot;
  start: () => void;
};

export type SimulationControllerOptions = {
  decisionBackend?: SimulationDecisionBackend;
  movementBackend?: MovementBackend;
};

export function useSimulationController(
  scene: CrowdSimScene,
  options: SimulationControllerOptions = {},
): SimulationController {
  const { decisionBackend, movementBackend } = options;
  const engine = useMemo(
    () => createSimulationEngineFromScene(scene, { decisionBackend, movementBackend }),
    [decisionBackend, movementBackend, scene],
  );
  const frameRef = useRef(0);
  const watchdogRef = useRef(0);
  const tickInFlightRef = useRef(false);
  const lastFrameAtRef = useRef<number | null>(null);

  const [snapshot, setSnapshot] = useState(() => engine.snapshot());
  // The engine is rebuilt whenever the scene changes, but `useState` only reads
  // the initial snapshot once. Reset both while rendering (React's documented
  // "adjust state when a prop changes" pattern) instead of in an effect, which
  // would cascade an extra render on every scene swap.
  const [snapshotEngine, setSnapshotEngine] = useState(engine);

  if (snapshotEngine !== engine) {
    setSnapshotEngine(engine);
    setSnapshot(engine.snapshot());
  }

  useEffect(() => {
    if (snapshot.status !== "running" || typeof window === "undefined") {
      return;
    }

    let cancelled = false;

    function currentTime() {
      return typeof performance !== "undefined" ? performance.now() : Date.now();
    }

    function advance(frameTime: number) {
      if (cancelled) {
        return;
      }

      if (movementBackend && tickInFlightRef.current) {
        return;
      }

      const lastFrameAt = lastFrameAtRef.current ?? frameTime;
      const deltaSeconds = (frameTime - lastFrameAt) / 1000;

      lastFrameAtRef.current = frameTime;

      if (movementBackend) {
        tickInFlightRef.current = true;
        void engine
          .tickAsync(deltaSeconds)
          .then((nextSnapshot) => {
            if (!cancelled) {
              setSnapshot(nextSnapshot);
            }
          })
          .finally(() => {
            tickInFlightRef.current = false;
          });
        return;
      }

      setSnapshot(engine.tick(deltaSeconds));
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
  }, [engine, movementBackend, snapshot.status, snapshot.timeScale]);

  const start = useCallback(() => {
    lastFrameAtRef.current = null;
    setSnapshot(engine.start());
  }, [engine]);

  const pause = useCallback(() => {
    setSnapshot(engine.pause());
  }, [engine]);

  const reset = useCallback(() => {
    lastFrameAtRef.current = null;
    setSnapshot(engine.reset());
  }, [engine]);

  const setTimeScale = useCallback(
    (timeScale: number) => {
      setSnapshot(engine.setTimeScale(timeScale));
    },
    [engine],
  );

  const setEvacuation = useCallback(
    (active: boolean) => {
      setSnapshot(engine.setEvacuation(active));
    },
    [engine],
  );

  return {
    pause,
    reset,
    setEvacuation,
    setTimeScale,
    snapshot,
    start,
  };
}
