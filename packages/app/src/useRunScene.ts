import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { useCallback, useState } from "react";
import { hotUpdateBlocker } from "./engine/simulationEngine";
import type { SimulationDecisionBackend } from "./engine/simulationDecisionBackend";

/**
 * The scene a simulation run was *built* from (ADR-0007).
 *
 * Controllers key their engine / worker on this instead of on the live scene.
 * An edit the engine can swap in place leaves it unchanged, so the run survives
 * and the controller pushes the edit as a hot update. An edit it cannot swap
 * (new seed, new world size, a backend that bakes the scene in) moves it to the
 * new scene, which re-inits the run exactly as every edit used to.
 *
 * `reinit` is the escape hatch for a hot update the engine refused anyway.
 */
export function useRunScene(
  scene: CrowdSimScene,
  injectedBackend?: SimulationDecisionBackend,
) {
  const [state, setState] = useState({ run: scene, seen: scene });
  let run = state.run;
  if (scene !== state.seen) {
    // Adjust state while rendering (React's documented pattern for "derive
    // from a changed prop"), so the stale run key never reaches an effect.
    if (hotUpdateBlocker(state.seen, scene, injectedBackend) !== null) run = scene;
    setState({ run, seen: scene });
  }
  const reinit = useCallback(
    (next: CrowdSimScene) => setState({ run: next, seen: next }),
    [],
  );
  return { reinit, runScene: run };
}
