import { sceneFloors } from "@crowdsim/scene-schema";
import { socialForceParameters, type SocialForceParameters } from "./crowdMovement";
import { crowdBudget } from "./crowdBudget";
import { createGpuCrowdPlanePool, toGpuSimCoreParams } from "./gpuCrowdBackend";
import {
  createSimulationEngineFromScene,
  defaultFixedDtSeconds,
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
  navigator: Navigator & { gpu?: GPU };
  onmessage: ((event: MessageEvent<SimulationWorkerRequest>) => void) | null;
  postMessage: (message: SimulationWorkerResponse) => void;
};

let engine: SceneSimulationEngine | undefined;
let sharedMemory: SimulationWorkerSharedMemory | undefined;
/** The scene's floors in order: what an agent's floor index in shared memory means. */
let floorIds: string[] = [];

/**
 * ADR-0033 stage 3: real GPU device acquisition inside the worker, attempted
 * only once per `init` (movement backend is decided once, never reactively —
 * see `SimulationEngineConfig.movementBackend`'s own doc comment). Returns
 * `undefined` for any failure (no `navigator.gpu`, no adapter, a rejected
 * `requestDevice`) rather than throwing: the caller's job is to fall back to
 * `"cpu-compat"` transparently, not to fail the whole `init`.
 */
async function acquireGpuMovement(
  maxAgents: number,
  fixedDtSeconds: number,
  movementParameters: Partial<SocialForceParameters> | undefined,
) {
  if (!workerScope.navigator.gpu) {
    return undefined;
  }
  try {
    const adapter = await workerScope.navigator.gpu.requestAdapter();
    if (!adapter) {
      return undefined;
    }
    const device = await adapter.requestDevice({
      requiredLimits: { maxStorageBuffersPerShaderStage: 16 },
    });
    // The scene's own calibration overrides (if any) are applied ONCE, here,
    // at pool construction -- unlike the CPU path, which re-merges
    // `movementParameters` into `socialForceParameters` fresh every tick
    // (`stepCrowd`'s own `p = {...socialForceParameters, ...input.parameters}`).
    // A `GpuSimCore`'s params are fixed at construction, so GPU mode cannot
    // reflect a live parameter change mid-run the way CPU mode can — a real,
    // disclosed gap, not a silent one.
    const effectiveParameters = movementParameters
      ? { ...socialForceParameters, ...movementParameters }
      : socialForceParameters;
    const pool = createGpuCrowdPlanePool(device, {
      capacity: maxAgents,
      params: toGpuSimCoreParams(effectiveParameters, fixedDtSeconds),
    });
    return { device, pool };
  } catch {
    return undefined;
  }
}
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

      // ADR-0033 stage 3: decided once, here, never reactively afterward
      // (see `movementBackend`'s own doc comment on `SimulationEngineConfig`
      // for why: this project has already been burned once by switching a
      // *running* simulation's path reactively on an async signal).
      let movementBackend: "cpu-compat" | "webgpu" = "cpu-compat";
      let gpuMovement: { pool: ReturnType<typeof createGpuCrowdPlanePool> } | undefined;
      let statusMessage = "cpu-compat (default)";
      if (message.runtime?.movementBackend === "webgpu") {
        const acquired = await acquireGpuMovement(
          message.simulation?.maxAgents ?? crowdBudget.maxAgents,
          message.simulation?.fixedDtSeconds ?? defaultFixedDtSeconds,
          message.simulation?.movementParameters,
        );
        if (acquired) {
          movementBackend = "webgpu";
          gpuMovement = { pool: acquired.pool };
          statusMessage = "webgpu device acquired";
          // Lost device fallback (ADR-0006: never silently hang, never
          // silently keep claiming a backend that is no longer real).
          // Fires at most once per device (the spec's own guarantee) at
          // whatever future time the device is actually lost, if ever --
          // deliberately fire-and-forget, not awaited: there is no request
          // this belongs to, and nothing to do if it somehow never fires.
          void acquired.device.lost.then((info) => {
            engine?.setMovementBackend("cpu-compat");
            workerScope.postMessage({
              active: "cpu-compat",
              message: `WebGPU device lost (${info.reason}) — fell back to cpu-compat`,
              type: "movement-backend-status",
            });
          });
        } else {
          statusMessage =
            "webgpu requested but unavailable (no adapter, or device request failed) — fell back to cpu-compat";
        }
      }

      engine = createSimulationEngineFromScene(message.scene, {
        ...message.simulation,
        decisionBackend,
        gpuMovement,
        movementBackend,
      });
      sharedMemory = message.sharedBuffer
        ? createSimulationSharedMemoryView(message.sharedBuffer)
        : undefined;
      postSnapshot(message.id, engine.snapshot());
      workerScope.postMessage({
        active: movementBackend,
        message: statusMessage,
        type: "movement-backend-status",
      });
      return;
    }

    if (!engine) {
      throw new Error("Simulation worker is not initialized");
    }

    if (message.type === "update-scene") {
      // `updateScene` throws when the change cannot be hot-swapped
      // (`hotUpdateBlocker`), so the floors are read only once the engine has
      // accepted the scene: they describe what the engine is actually running,
      // and every snapshot writes them into shared memory. Reading them before
      // the call left a refused update with the NEW scene's floors and the OLD
      // scene's geometry until the re-init landed.
      const snapshot = engine.updateScene(message.scene);
      floorIds = sceneFloors(message.scene).map((floor) => floor.id);
      postSnapshot(message.id, snapshot);
      return;
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

    if (message.type === "tick") {
      // tickAsync (ADR-0033 stage 3): identical to tick() when
      // movementBackend is cpu-compat (the default), and the only entry
      // point that can serve webgpu mode (a GPU readback is inherently
      // asynchronous). Always safe to call unconditionally.
      postSnapshot(message.id, await engine.tickAsync(message.realDeltaSeconds));
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
