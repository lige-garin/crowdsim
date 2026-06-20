import type { CrowdSimScene } from "@crowdsim/scene-schema";
import {
  calculateEnvironmentImpact,
  type EnvironmentImpact,
} from "./environmentEffects";
import {
  createBioCityDecisionBackend,
  shouldUseBioCityDecisionBackend,
} from "./bioAgentBehavior";
import { createRouteCostMap, type RouteCostMap } from "./routeCostMap";
import {
  createSimulationEngineFromScene,
  type SimulationSnapshot,
} from "./simulationEngine";

export type SimulationOrchestratorSnapshot = SimulationSnapshot & {
  decisionTickCount: number;
  environmentImpact: EnvironmentImpact;
  movementBackend: "cpu-compat" | "webgpu-ready";
  movementHz: number;
  routeCostMap: RouteCostMap;
  decisionBackend: "rule-ts" | "wasm-ready";
  decisionHz: number;
};

export type SimulationOrchestrator = {
  pause: () => SimulationOrchestratorSnapshot;
  reset: () => SimulationOrchestratorSnapshot;
  setEvacuation: (active: boolean) => SimulationOrchestratorSnapshot;
  setTimeScale: (timeScale: number) => SimulationOrchestratorSnapshot;
  snapshot: () => SimulationOrchestratorSnapshot;
  start: () => SimulationOrchestratorSnapshot;
  step: (steps?: number) => SimulationOrchestratorSnapshot;
  tick: (realDeltaSeconds: number) => SimulationOrchestratorSnapshot;
};

const movementHz = 60;
const decisionHz = 10;
const decisionEverySteps = movementHz / decisionHz;

export function createSimulationOrchestrator(
  scene: CrowdSimScene,
): SimulationOrchestrator {
  const decisionBackend = shouldUseBioCityDecisionBackend(scene)
    ? createBioCityDecisionBackend(scene)
    : undefined;
  const engine = createSimulationEngineFromScene(scene, { decisionBackend });
  let decisionTickCount = 0;

  function wrap(snapshot: SimulationSnapshot): SimulationOrchestratorSnapshot {
    decisionTickCount = Math.floor(snapshot.stepCount / decisionEverySteps);

    return {
      ...snapshot,
      decisionBackend: "rule-ts",
      decisionHz,
      decisionTickCount,
      environmentImpact: calculateEnvironmentImpact(scene, snapshot.elapsedSeconds),
      movementBackend: "cpu-compat",
      movementHz,
      routeCostMap: createRouteCostMap(scene, snapshot.elapsedSeconds),
    };
  }

  return {
    pause: () => wrap(engine.pause()),
    reset: () => {
      decisionTickCount = 0;
      return wrap(engine.reset());
    },
    setEvacuation: (active: boolean) => wrap(engine.setEvacuation(active)),
    setTimeScale: (timeScale: number) => wrap(engine.setTimeScale(timeScale)),
    snapshot: () => wrap(engine.snapshot()),
    start: () => wrap(engine.start()),
    step: (steps?: number) => wrap(engine.step(steps)),
    tick: (realDeltaSeconds: number) => wrap(engine.tick(realDeltaSeconds)),
  };
}

export function createOrchestratorReadinessSummary(
  snapshot: Pick<
    SimulationOrchestratorSnapshot,
    "decisionBackend" | "movementBackend" | "routeCostMap"
  >,
) {
  return [
    `movement=${snapshot.movementBackend}`,
    `decision=${snapshot.decisionBackend}`,
    `routeCostCells=${snapshot.routeCostMap.cells.length}`,
  ].join(" | ");
}
