import { sceneFloors } from "@crowdsim/scene-schema";
import {
  createSimulationEngineFromScene,
  type SceneSimulationEngine,
} from "./simulationEngine";
import type {
  SimulationWorkerRequest,
  SimulationWorkerResponse,
  SimulationWorkerSharedMemory,
} from "./simulationWorkerClient";
import {
  createSimulationSharedMemoryView,
  writeSimulationSharedMemory,
} from "./simulationWorkerClient";

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<SimulationWorkerRequest>) => void) | null;
  postMessage: (message: SimulationWorkerResponse) => void;
};

let engine: SceneSimulationEngine | undefined;
let sharedMemory: SimulationWorkerSharedMemory | undefined;
/** The scene's floors in order: what an agent's floor index in shared memory means. */
let floorIds: string[] = [];
/**
 * Messages are handled one at a time. `init` awaits a dynamic import of the wasm
 * decision backend, and anything that arrived during that await used to run
 * first and fail with "not initialized" — the client never recovered because the
 * failed command was already answered with an error.
 */
let queue: Promise<void> = Promise.resolve();

workerScope.onmessage = (event) => {
  const message = event.data;

  // The catch keeps the chain alive: a rejected link would silently swallow every
  // later message, which is the failure mode this queue exists to prevent.
  queue = queue.then(() => handleMessage(message)).catch(() => undefined);
};

async function handleMessage(message: SimulationWorkerRequest) {
  try {
    if (message.type === "init") {
      const decisionBackend = message.runtime?.wasmDecisionBackend
        ? await import("./behaviorWasm").then(
            ({ createWasmSimulationDecisionBackend }) =>
              createWasmSimulationDecisionBackend(message.scene),
          )
        : undefined;
      floorIds = sceneFloors(message.scene).map((floor) => floor.id);
      engine = createSimulationEngineFromScene(message.scene, {
        ...message.simulation,
        decisionBackend,
      });
      sharedMemory = message.sharedBuffer
        ? createSimulationSharedMemoryView(message.sharedBuffer)
        : undefined;
      postSnapshot(message.id, engine.snapshot());
      return;
    }

    if (!engine) {
      throw new Error("Simulation worker is not initialized");
    }

    if (message.type === "update-scene") {
      floorIds = sceneFloors(message.scene).map((floor) => floor.id);
    }

    if (message.type === "start") {
      postSnapshot(message.id, engine.start());
      return;
    }

    if (message.type === "pause") {
      postSnapshot(message.id, engine.pause());
      return;
    }

    if (message.type === "reset") {
      postSnapshot(message.id, engine.reset());
      return;
    }

    if (message.type === "set-time-scale") {
      postSnapshot(message.id, engine.setTimeScale(message.timeScale));
      return;
    }

    if (message.type === "set-evacuation") {
      postSnapshot(message.id, engine.setEvacuation(message.active));
      return;
    }

    if (message.type === "update-scene") {
      postSnapshot(message.id, engine.updateScene(message.scene));
      return;
    }

    if (message.type === "tick") {
      postSnapshot(message.id, engine.tick(message.realDeltaSeconds));
      return;
    }

    postSnapshot(message.id, engine.snapshot());
  } catch (error) {
    workerScope.postMessage({
      id: message.id,
      message: error instanceof Error ? error.message : "Simulation worker failed",
      type: "error",
    });
  }
}

function postSnapshot(
  id: number,
  snapshot: ReturnType<SceneSimulationEngine["snapshot"]>,
) {
  writeSimulationSharedMemory(sharedMemory, snapshot, floorIds);
  workerScope.postMessage({
    id,
    snapshot,
    type: "snapshot",
  });
}
