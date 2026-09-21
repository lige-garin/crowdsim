import { agentStateCode } from "./agentStateColors";
import { crowdBudget } from "./crowdBudget";
import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { createWasmSimulationDecisionBackend } from "./behaviorWasm";
import {
  createSimulationEngineFromScene,
  type SceneSimulationEngine,
  type SimulationEngineConfig,
  type SimulationAgent,
  type SimulationSnapshot,
} from "./simulationEngine";
const sharedHeaderIntCount = 8;
const sharedIntLaneCount = 4;
const sharedFloatLaneCount = 6;
const sharedVersion = 1;
const headerStatusIndex = 0;
const headerStepCountIndex = 1;
const headerAgentCountIndex = 2;
const headerSpawnedCountIndex = 3;
const headerExitedCountIndex = 4;
const headerElapsedMillisecondsIndex = 5;
const headerCapacityIndex = 6;
const headerVersionIndex = 7;
export type SimulationWorkerSharedMemory = {
  buffer: SharedArrayBuffer;
  capacity: number;
  view: Int32Array;
};
export type SimulationSharedAgentFrame = {
  agents: Array<
    Pick<SimulationAgent, "id" | "targetX" | "targetY" | "vx" | "vy" | "x" | "y"> & {
      behaviorState: number;
      flags: number;
      /**
       * Which floor they are on, as a place in the scene's floors (ADR-0010):
       * -1 in a scene with none. An index rather than an id because this is a
       * shared integer buffer, and the order is the scene's own.
       */
      floorIndex: number;
    }
  >;
  capacity: number;
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
export type SimulationWorkerSetEvacuationRequest = {
  active: boolean;
  id: number;
  type: "set-evacuation";
};
/** Hot scene update (ADR-0007): swap geometry, keep the running crowd. */
export type SimulationWorkerUpdateSceneRequest = {
  id: number;
  scene: CrowdSimScene;
  type: "update-scene";
};
export type SimulationWorkerTickRequest = {
  id: number;
  realDeltaSeconds: number;
  type: "tick";
};
export type SimulationWorkerRequest =
  | SimulationWorkerCommandRequest
  | SimulationWorkerInitRequest
  | SimulationWorkerSetEvacuationRequest
  | SimulationWorkerSetTimeScaleRequest
  | SimulationWorkerTickRequest
  | SimulationWorkerUpdateSceneRequest;
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
  | Omit<SimulationWorkerSetEvacuationRequest, "id">
  | Omit<SimulationWorkerSetTimeScaleRequest, "id">
  | Omit<SimulationWorkerTickRequest, "id">
  | Omit<SimulationWorkerUpdateSceneRequest, "id">;
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
  setEvacuation: (active: boolean) => Promise<SimulationSnapshot>;
  setTimeScale: (timeScale: number) => Promise<SimulationSnapshot>;
  snapshot: () => Promise<SimulationSnapshot>;
  start: () => Promise<SimulationSnapshot>;
  tick: (realDeltaSeconds: number) => Promise<SimulationSnapshot>;
  /** Rejects when the engine refuses a hot update; the caller must re-init. */
  updateScene: (scene: CrowdSimScene) => Promise<SimulationSnapshot>;
};
/** Rejection reason for requests cut short by `dispose()`. */
export const simulationWorkerDisposedMessage = "Simulation worker disposed";
export function createSimulationWorker(): SimulationWorkerLike {
  return new Worker(new URL("./simulation.worker.ts", import.meta.url), {
    name: "crowdsim-live-simulation-worker",
    type: "module",
  });
}
export function createSimulationSharedMemory(
  runtime: typeof globalThis = globalThis,
  capacity: number = crowdBudget.sharedCapacity,
): SimulationWorkerSharedMemory | undefined {
  if (
    typeof runtime.SharedArrayBuffer !== "function" ||
    typeof runtime.Atomics !== "object" ||
    runtime.crossOriginIsolated !== true
  ) {
    return undefined;
  }
  const safeCapacity = Math.max(1, Math.floor(capacity));
  const buffer = new runtime.SharedArrayBuffer(
    Int32Array.BYTES_PER_ELEMENT *
      (sharedHeaderIntCount +
        safeCapacity * sharedIntLaneCount +
        safeCapacity * sharedFloatLaneCount),
  );
  return createSimulationSharedMemoryView(buffer);
}
export function createSimulationSharedMemoryView(
  buffer: SharedArrayBuffer,
): SimulationWorkerSharedMemory {
  const intLength = buffer.byteLength / Int32Array.BYTES_PER_ELEMENT;
  const capacity = Math.max(
    0,
    Math.floor((intLength - sharedHeaderIntCount) / lanesPerAgent()),
  );
  const view = new Int32Array(buffer);
  Atomics.store(view, headerCapacityIndex, capacity);
  Atomics.store(view, headerVersionIndex, sharedVersion);
  return {
    buffer,
    capacity,
    view,
  };
}
export function writeSimulationSharedMemory(
  sharedMemory: SimulationWorkerSharedMemory | undefined,
  snapshot: SimulationSnapshot,
  /** The scene's floors in order, so each agent's floor can go in as an index. */
  floorIds: readonly string[] = [],
) {
  if (!sharedMemory || typeof Atomics !== "object") {
    return;
  }
  Atomics.store(
    sharedMemory.view,
    headerStatusIndex,
    snapshot.status === "running" ? 1 : 0,
  );
  Atomics.store(sharedMemory.view, headerStepCountIndex, snapshot.stepCount);
  Atomics.store(sharedMemory.view, headerAgentCountIndex, snapshot.agentCount);
  Atomics.store(sharedMemory.view, headerSpawnedCountIndex, snapshot.spawnedCount);
  Atomics.store(sharedMemory.view, headerExitedCountIndex, snapshot.exitedCount);
  Atomics.store(
    sharedMemory.view,
    headerElapsedMillisecondsIndex,
    Math.round(snapshot.elapsedSeconds * 1000),
  );
  Atomics.store(sharedMemory.view, headerCapacityIndex, sharedMemory.capacity);
  Atomics.store(sharedMemory.view, headerVersionIndex, sharedVersion);
  writeSimulationSharedAgents(sharedMemory, snapshot.agents, floorIds);
}
export function readSimulationSharedMemory(sharedMemory: SimulationWorkerSharedMemory) {
  return {
    agentCount: Atomics.load(sharedMemory.view, headerAgentCountIndex),
    capacity: Atomics.load(sharedMemory.view, headerCapacityIndex),
    elapsedMilliseconds: Atomics.load(
      sharedMemory.view,
      headerElapsedMillisecondsIndex,
    ),
    exitedCount: Atomics.load(sharedMemory.view, headerExitedCountIndex),
    spawnedCount: Atomics.load(sharedMemory.view, headerSpawnedCountIndex),
    status:
      Atomics.load(sharedMemory.view, headerStatusIndex) === 1 ? "running" : "paused",
    stepCount: Atomics.load(sharedMemory.view, headerStepCountIndex),
    version: Atomics.load(sharedMemory.view, headerVersionIndex),
  };
}
export function readSimulationSharedAgents(
  sharedMemory: SimulationWorkerSharedMemory,
  limit = sharedMemory.capacity,
): SimulationSharedAgentFrame {
  const count = Math.min(
    Math.max(0, Atomics.load(sharedMemory.view, headerAgentCountIndex)),
    sharedMemory.capacity,
    Math.max(0, Math.floor(limit)),
  );
  const floatView = new Float32Array(sharedMemory.buffer);
  const agents: SimulationSharedAgentFrame["agents"] = [];
  for (let index = 0; index < count; index++) {
    const flags = Atomics.load(
      sharedMemory.view,
      intLaneOffset("flags", index, sharedMemory.capacity),
    );
    if ((flags & 1) === 0) {
      continue;
    }
    agents.push({
      behaviorState: Atomics.load(
        sharedMemory.view,
        intLaneOffset("behaviorState", index, sharedMemory.capacity),
      ),
      flags,
      id: Atomics.load(
        sharedMemory.view,
        intLaneOffset("agentId", index, sharedMemory.capacity),
      ),
      floorIndex: Atomics.load(
        sharedMemory.view,
        intLaneOffset("floorIndex", index, sharedMemory.capacity),
      ),
      targetX: floatView[floatLaneOffset("targetX", index, sharedMemory.capacity)],
      targetY: floatView[floatLaneOffset("targetY", index, sharedMemory.capacity)],
      vx: floatView[floatLaneOffset("velocityX", index, sharedMemory.capacity)],
      vy: floatView[floatLaneOffset("velocityY", index, sharedMemory.capacity)],
      x: floatView[floatLaneOffset("positionX", index, sharedMemory.capacity)],
      y: floatView[floatLaneOffset("positionY", index, sharedMemory.capacity)],
    });
  }
  return {
    agents,
    capacity: sharedMemory.capacity,
  };
}
function writeSimulationSharedAgents(
  sharedMemory: SimulationWorkerSharedMemory,
  agents: readonly SimulationAgent[],
  floorIds: readonly string[],
) {
  const floatView = new Float32Array(sharedMemory.buffer);
  const count = Math.min(agents.length, sharedMemory.capacity);
  for (let index = 0; index < sharedMemory.capacity; index++) {
    if (index >= count) {
      Atomics.store(
        sharedMemory.view,
        intLaneOffset("flags", index, sharedMemory.capacity),
        0,
      );
      continue;
    }
    const agent = agents[index];
    Atomics.store(
      sharedMemory.view,
      intLaneOffset("agentId", index, sharedMemory.capacity),
      agent.id,
    );
    Atomics.store(
      sharedMemory.view,
      intLaneOffset("behaviorState", index, sharedMemory.capacity),
      agentStateCode(agent.lifecycleState),
    );
    Atomics.store(
      sharedMemory.view,
      intLaneOffset("flags", index, sharedMemory.capacity),
      1,
    );
    Atomics.store(
      sharedMemory.view,
      intLaneOffset("floorIndex", index, sharedMemory.capacity),
      agent.floorId === undefined ? -1 : floorIds.indexOf(agent.floorId),
    );
    floatView[floatLaneOffset("positionX", index, sharedMemory.capacity)] = agent.x;
    floatView[floatLaneOffset("positionY", index, sharedMemory.capacity)] = agent.y;
    floatView[floatLaneOffset("velocityX", index, sharedMemory.capacity)] = agent.vx;
    floatView[floatLaneOffset("velocityY", index, sharedMemory.capacity)] = agent.vy;
    floatView[floatLaneOffset("targetX", index, sharedMemory.capacity)] = agent.targetX;
    floatView[floatLaneOffset("targetY", index, sharedMemory.capacity)] = agent.targetY;
  }
}
type IntLane = "agentId" | "behaviorState" | "flags" | "floorIndex";
type FloatLane =
  | "positionX"
  | "positionY"
  | "targetX"
  | "targetY"
  | "velocityX"
  | "velocityY";
function intLaneOffset(lane: IntLane, agentIndex: number, capacity: number) {
  const laneIndex: Record<IntLane, number> = {
    agentId: 0,
    behaviorState: 1,
    flags: 2,
    floorIndex: 3,
  };
  return sharedHeaderIntCount + laneIndex[lane] * capacity + agentIndex;
}
function floatLaneOffset(lane: FloatLane, agentIndex: number, capacity: number) {
  const laneIndex: Record<FloatLane, number> = {
    positionX: 0,
    positionY: 1,
    velocityX: 2,
    velocityY: 3,
    targetX: 4,
    targetY: 5,
  };
  return (
    sharedHeaderIntCount +
    capacity * sharedIntLaneCount +
    laneIndex[lane] * capacity +
    agentIndex
  );
}
function lanesPerAgent() {
  return sharedIntLaneCount + sharedFloatLaneCount;
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
  let disposed = false;
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
    if (disposed) {
      return Promise.reject(new Error(simulationWorkerDisposedMessage));
    }
    const id = nextId++;
    return new Promise<SimulationSnapshot>((resolve, reject) => {
      pending.set(id, { reject, resolve });
      worker.postMessage({ ...message, id } as SimulationWorkerRequest);
    });
  }
  return {
    dispose() {
      disposed = true;
      worker.terminate();
      const error = new Error(simulationWorkerDisposedMessage);
      for (const request of pending.values()) {
        request.reject(error);
      }
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
    setEvacuation: (active) => send({ active, type: "set-evacuation" }),
    setTimeScale: (timeScale) => send({ timeScale, type: "set-time-scale" }),
    snapshot: () => send({ type: "snapshot" }),
    start: () => send({ type: "start" }),
    tick: (realDeltaSeconds) => send({ realDeltaSeconds, type: "tick" }),
    updateScene: (scene) => send({ scene, type: "update-scene" }),
  };
}
function createInlineSimulationWorkerClient(): SimulationWorkerClient {
  let engine: SceneSimulationEngine | undefined;
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
  function run(command: (current: SceneSimulationEngine) => SimulationSnapshot) {
    try {
      return publish(command(requireEngine()));
    } catch (error) {
      return Promise.reject(
        error instanceof Error ? error : new Error("Simulation worker failed"),
      );
    }
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
    pause: () => run((current) => current.pause()),
    reset: () => run((current) => current.reset()),
    setEvacuation: (active) => run((current) => current.setEvacuation(active)),
    setTimeScale: (timeScale) => run((current) => current.setTimeScale(timeScale)),
    snapshot: () => run((current) => current.snapshot()),
    start: () => run((current) => current.start()),
    tick: (realDeltaSeconds) => run((current) => current.tick(realDeltaSeconds)),
    updateScene: (scene) => run((current) => current.updateScene(scene)),
  };
}
