import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { createWasmSimulationDecisionBackend } from "./behaviorWasm";
import {
  createSimulationEngineFromScene,
  type SimulationEngineConfig,
  type SimulationAgent,
  type SimulationSnapshot,
} from "./simulationEngine";

const sharedHeaderIntCount = 8;
const sharedIntLaneCount = 3;
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
  capacity = 2_000,
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

  writeSimulationSharedAgents(sharedMemory, snapshot.agents);
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
      lifecycleStateCode(agent.lifecycleState),
    );
    Atomics.store(
      sharedMemory.view,
      intLaneOffset("flags", index, sharedMemory.capacity),
      1,
    );
    floatView[floatLaneOffset("positionX", index, sharedMemory.capacity)] = agent.x;
    floatView[floatLaneOffset("positionY", index, sharedMemory.capacity)] = agent.y;
    floatView[floatLaneOffset("velocityX", index, sharedMemory.capacity)] = agent.vx;
    floatView[floatLaneOffset("velocityY", index, sharedMemory.capacity)] = agent.vy;
    floatView[floatLaneOffset("targetX", index, sharedMemory.capacity)] = agent.targetX;
    floatView[floatLaneOffset("targetY", index, sharedMemory.capacity)] = agent.targetY;
  }
}

type IntLane = "agentId" | "behaviorState" | "flags";
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

function lifecycleStateCode(state: SimulationAgent["lifecycleState"]) {
  switch (state) {
    case "walk":
      return 1;
    case "browse":
      return 2;
    case "queue":
      return 3;
    case "enterStore":
      return 4;
    case "leave":
      return 5;
    case "evacuate":
      return 6;
    default:
      return 0;
  }
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
