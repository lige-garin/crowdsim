import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { createWasmSimulationDecisionBackend } from "./behaviorWasm";
import {
  createSimulationEngineFromScene,
  type SimulationEngineConfig,
  type SimulationSnapshot,
} from "./simulationEngine";

const sharedMetricCount = 6;

export type SimulationWorkerSharedMemory = {
  buffer: SharedArrayBuffer;
  view: Int32Array;
};

export type SimulationWorkerRuntimeOptions = {
  wasmDecisionBackend?: boolean;
};

export type SimulationWorkerInitRequest = {
  id: number;
  runtime?: SimulationWorkerRuntimeOptions;
  scene: CrowdSimScene;
  sharedBuffer?: SharedArrayBuffer;
  simulation?: Partial<SimulationEngineConfig>;
  type: "init";
};

export type SimulationWorkerCommandRequest = {
  id: number;
  type: "pause" | "reset" | "snapshot" | "start";
};

export type SimulationWorkerSetTimeScaleRequest = {
  id: number;
  timeScale: number;
  type: "set-time-scale";
};

export type SimulationWorkerTickRequest = {
  id: number;
  realDeltaSeconds: number;
  type: "tick";
};

export type SimulationWorkerRequest =
  | SimulationWorkerCommandRequest
  | SimulationWorkerInitRequest
  | SimulationWorkerSetTimeScaleRequest
  | SimulationWorkerTickRequest;

export type SimulationWorkerResponse =
  | {
      id: number;
      snapshot: SimulationSnapshot;
      type: "snapshot";
    }
  | {
      id: number;
      message: string;
      type: "error";
    };

type SimulationWorkerRequestPayload =
  | Omit<SimulationWorkerCommandRequest, "id">
  | Omit<SimulationWorkerInitRequest, "id">
  | Omit<SimulationWorkerSetTimeScaleRequest, "id">
  | Omit<SimulationWorkerTickRequest, "id">;

export type SimulationWorkerLike = {
  onerror: ((event: ErrorEvent) => void) | null;
  onmessage: ((event: MessageEvent<SimulationWorkerResponse>) => void) | null;
  postMessage: (message: SimulationWorkerRequest) => void;
  terminate: () => void;
};

export type SimulationWorkerClient = {
  dispose: () => void;
  init: (
    scene: CrowdSimScene,
    options?: {
      runtime?: SimulationWorkerRuntimeOptions;
      sharedMemory?: SimulationWorkerSharedMemory;
      simulation?: Partial<SimulationEngineConfig>;
    },
  ) => Promise<SimulationSnapshot>;
  pause: () => Promise<SimulationSnapshot>;
  reset: () => Promise<SimulationSnapshot>;
  setTimeScale: (timeScale: number) => Promise<SimulationSnapshot>;
  snapshot: () => Promise<SimulationSnapshot>;
  start: () => Promise<SimulationSnapshot>;
  tick: (realDeltaSeconds: number) => Promise<SimulationSnapshot>;
};

export function createSimulationWorker(): SimulationWorkerLike {
  return new Worker(new URL("./simulation.worker.ts", import.meta.url), {
    name: "crowdsim-live-simulation-worker",
    type: "module",
  });
}

export function createSimulationSharedMemory(
  runtime: typeof globalThis = globalThis,
): SimulationWorkerSharedMemory | undefined {
  if (
    typeof runtime.SharedArrayBuffer !== "function" ||
    typeof runtime.Atomics !== "object" ||
    runtime.crossOriginIsolated !== true
  ) {
    return undefined;
  }

  const buffer = new runtime.SharedArrayBuffer(
    Int32Array.BYTES_PER_ELEMENT * sharedMetricCount,
  );

  return {
    buffer,
    view: new Int32Array(buffer),
  };
}

export function writeSimulationSharedMemory(
  sharedMemory: SimulationWorkerSharedMemory | undefined,
  snapshot: SimulationSnapshot,
) {
  if (!sharedMemory || typeof Atomics !== "object") {
    return;
  }

  Atomics.store(sharedMemory.view, 0, snapshot.status === "running" ? 1 : 0);
  Atomics.store(sharedMemory.view, 1, snapshot.stepCount);
  Atomics.store(sharedMemory.view, 2, snapshot.agentCount);
  Atomics.store(sharedMemory.view, 3, snapshot.spawnedCount);
  Atomics.store(sharedMemory.view, 4, snapshot.exitedCount);
  Atomics.store(sharedMemory.view, 5, Math.round(snapshot.elapsedSeconds * 1000));
}

export function readSimulationSharedMemory(sharedMemory: SimulationWorkerSharedMemory) {
  return {
    agentCount: Atomics.load(sharedMemory.view, 2),
    elapsedMilliseconds: Atomics.load(sharedMemory.view, 5),
    exitedCount: Atomics.load(sharedMemory.view, 4),
    spawnedCount: Atomics.load(sharedMemory.view, 3),
    status: Atomics.load(sharedMemory.view, 0) === 1 ? "running" : "paused",
    stepCount: Atomics.load(sharedMemory.view, 1),
  };
}

export function createSimulationWorkerClient(
  options: {
    workerFactory?: (() => SimulationWorkerLike) | null;
  } = {},
): SimulationWorkerClient {
  if (
    options.workerFactory === null ||
    (!options.workerFactory && typeof Worker === "undefined")
  ) {
    return createInlineSimulationWorkerClient();
  }

  const worker = options.workerFactory?.() ?? createSimulationWorker();
  let nextId = 1;
  const pending = new Map<
    number,
    {
      reject: (error: Error) => void;
      resolve: (snapshot: SimulationSnapshot) => void;
    }
  >();

  worker.onmessage = (event) => {
    const message = event.data;
    const request = pending.get(message.id);

    if (!request) {
      return;
    }

    pending.delete(message.id);

    if (message.type === "error") {
      request.reject(new Error(message.message));
    } else {
      request.resolve(message.snapshot);
    }
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || "Simulation worker failed");

    for (const request of pending.values()) {
      request.reject(error);
    }

    pending.clear();
  };

  function send(message: SimulationWorkerRequestPayload) {
    const id = nextId++;

    return new Promise<SimulationSnapshot>((resolve, reject) => {
      pending.set(id, { reject, resolve });
      worker.postMessage({ ...message, id } as SimulationWorkerRequest);
    });
  }

  return {
    dispose() {
      worker.terminate();
      pending.clear();
    },
    init: (scene, options) =>
      send({
        scene,
        runtime: options?.runtime,
        sharedBuffer: options?.sharedMemory?.buffer,
        simulation: options?.simulation,
        type: "init",
      }),
    pause: () => send({ type: "pause" }),
    reset: () => send({ type: "reset" }),
    setTimeScale: (timeScale) => send({ timeScale, type: "set-time-scale" }),
    snapshot: () => send({ type: "snapshot" }),
    start: () => send({ type: "start" }),
    tick: (realDeltaSeconds) => send({ realDeltaSeconds, type: "tick" }),
  };
}

function createInlineSimulationWorkerClient(): SimulationWorkerClient {
  let engine: ReturnType<typeof createSimulationEngineFromScene> | undefined;
  let sharedMemory: SimulationWorkerSharedMemory | undefined;

  function requireEngine() {
    if (!engine) {
      throw new Error("Simulation worker is not initialized");
    }

    return engine;
  }

  function publish(snapshot: SimulationSnapshot) {
    writeSimulationSharedMemory(sharedMemory, snapshot);
    return Promise.resolve(snapshot);
  }

  return {
    dispose() {
      engine = undefined;
      sharedMemory = undefined;
    },
    async init(scene, options) {
      sharedMemory = options?.sharedMemory;
      const decisionBackend = options?.runtime?.wasmDecisionBackend
        ? await createWasmSimulationDecisionBackend(scene)
        : undefined;
      engine = createSimulationEngineFromScene(scene, {
        ...options?.simulation,
        decisionBackend,
      });
      return publish(engine.snapshot());
    },
    pause: () => publish(requireEngine().pause()),
    reset: () => publish(requireEngine().reset()),
    setTimeScale: (timeScale) => publish(requireEngine().setTimeScale(timeScale)),
    snapshot: () => publish(requireEngine().snapshot()),
    start: () => publish(requireEngine().start()),
    tick: (realDeltaSeconds) => publish(requireEngine().tick(realDeltaSeconds)),
  };
}
