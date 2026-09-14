import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CrowdSimScene } from "@crowdsim/scene-schema";
import {
  createSimulationEngineFromScene,
  type SimulationSnapshot,
} from "./simulationEngine";
import type { SimulationDecisionBackend } from "./simulationDecisionBackend";
import { useRunScene } from "./useRunScene";

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
};

export function useSimulationController(
  scene: CrowdSimScene,
  options: SimulationControllerOptions = {},
): SimulationController {
  const { decisionBackend } = options;
  const { reinit, runScene } = useRunScene(scene, decisionBackend);
  const engine = useMemo(
    () => createSimulationEngineFromScene(runScene, { decisionBackend }),
    [decisionBackend, runScene],
  );
  // Which scene each engine is currently running, for hot updates (ADR-0007).
  const engineSceneRef = useRef({ engine, scene: runScene });
  const frameRef = useRef(0);
  const watchdogRef = useRef(0);
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
    if (engineSceneRef.current.engine !== engine) {
      engineSceneRef.current = { engine, scene: runScene };
    }
    if (engineSceneRef.current.scene === scene) {
      return;
    }
    let next: SimulationSnapshot | undefined;
    try {
      next = engine.updateScene?.(scene);
    } catch {
      next = undefined;
    }
    engineSceneRef.current.scene = scene;
    // The engine is an external system; publish its answer like the worker
    // path does, asynchronously, rather than cascading a render from here.
    // Not cancelled on cleanup: a StrictMode re-run finds the scene already
    // applied and returns early, so this is the only publish. Only a newer
    // engine makes the answer stale.
    queueMicrotask(() => {
      if (engineSceneRef.current.engine !== engine) return;
      if (next) setSnapshot(next);
      else reinit(scene);
    });
  }, [engine, reinit, runScene, scene]);

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

      const lastFrameAt = lastFrameAtRef.current ?? frameTime;
      const deltaSeconds = (frameTime - lastFrameAt) / 1000;

      lastFrameAtRef.current = frameTime;

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
  }, [engine, snapshot.status, snapshot.timeScale]);

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
