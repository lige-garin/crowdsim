import { agentStateCode, agentStateKey } from "./agentStateColors";
import type { SimulationAgent, SimulationSnapshot } from "./simulationEngine";
import {
  createSimulationRuntimeArtifact,
  type SimulationRuntimeArtifact,
} from "./simulationRuntimeArtifact";

/**
 * One sampled instant of the run. People are stored in flat typed arrays, not
 * objects: a crowd of two thousand recorded for half an hour is millions of
 * samples, which as objects would be hundreds of megabytes of heap.
 */
export type TrajectoryFrame = {
  elapsedSeconds: number;
  exitedCount: number;
  ids: Int32Array;
  /** x, y, vx, vy for each person in `ids` order: metres and metres a second. */
  motion: Float32Array;
  /** What each person is doing, as `agentStateCode`. */
  states: Uint8Array;
};

export type TrajectoryRecording = {
  durationSeconds: number;
  frames: TrajectoryFrame[];
  id: string;
  runtime: SimulationRuntimeArtifact;
  /** People summed over all kept frames: what the sample budget counts. */
  sampleCount: number;
  sceneId: string;
  seed: number;
  startedAtIso: string;
};

export type TrajectoryRecordingInput = {
  id: string;
  runtime?: Partial<SimulationRuntimeArtifact>;
  sceneId: string;
  seed: number;
  startedAtIso?: string;
};

export type PackedAgentDelta = [
  id: number,
  dx: number,
  dy: number,
  dvx: number,
  dvy: number,
  state: number,
];

export type PackedTrajectoryFrame = {
  a: PackedAgentDelta[];
  e: number;
  t: number;
};

export type PackedTrajectoryRecording = {
  durationSeconds: number;
  frames: PackedTrajectoryFrame[];
  id: string;
  q: number;
  runtime: SimulationRuntimeArtifact;
  sceneId: string;
  seed: number;
  startedAtIso: string;
  version: 2;
};

/**
 * About 42 MB of samples (21 bytes each). At one frame a simulated second that
 * is half an hour of a 1,100-person crowd, or longer for smaller ones; past it
 * the oldest frames are dropped.
 */
export const defaultMaxTrajectorySamples = 2_000_000;

export function createTrajectoryRecording(
  input: TrajectoryRecordingInput,
): TrajectoryRecording {
  return {
    durationSeconds: 0,
    frames: [],
    id: input.id,
    runtime: createSimulationRuntimeArtifact(input.runtime),
    sampleCount: 0,
    sceneId: input.sceneId,
    seed: input.seed,
    startedAtIso: input.startedAtIso ?? new Date().toISOString(),
  };
}

export function appendTrajectoryFrame(
  recording: TrajectoryRecording,
  snapshot: SimulationSnapshot,
  options: { maxSamples?: number } = {},
): TrajectoryRecording {
  const maxSamples = Math.max(1, options.maxSamples ?? defaultMaxTrajectorySamples);
  const frames = [...recording.frames, createFrame(snapshot)];
  let sampleCount = recording.sampleCount + snapshot.agents.length;
  let dropped = 0;
  while (sampleCount > maxSamples && frames.length - dropped > 1) {
    sampleCount -= frames[dropped].ids.length;
    dropped += 1;
  }
  const kept = dropped > 0 ? frames.slice(dropped) : frames;

  return {
    ...recording,
    durationSeconds: kept[kept.length - 1].elapsedSeconds - kept[0].elapsedSeconds,
    frames: kept,
    sampleCount,
  };
}

/**
 * The crowd at any time within the recording, interpolated between the two
 * frames around it. People present in only one of the two are shown where that
 * frame has them, so arrivals and departures appear and vanish at frame edges.
 */
export function replayTrajectoryAt(
  recording: TrajectoryRecording,
  elapsedSeconds: number,
): SimulationSnapshot {
  const { frames } = recording;
  if (frames.length === 0) return replaySnapshot(elapsedSeconds, [], 0);

  const first = frames[0];
  const last = frames[frames.length - 1];
  const time = Math.max(
    first.elapsedSeconds,
    Math.min(last.elapsedSeconds, elapsedSeconds),
  );
  const afterIndex = firstFrameAtOrAfter(frames, time);
  const after = frames[afterIndex];
  const before = frames[Math.max(0, afterIndex - 1)];
  const span = after.elapsedSeconds - before.elapsedSeconds;
  const alpha = span > 0 ? (time - before.elapsedSeconds) / span : 1;

  const afterIndexById = new Map<number, number>();
  after.ids.forEach((id, index) => afterIndexById.set(id, index));
  const agents: SimulationAgent[] = [];
  const source = alpha < 0.5 ? before : after;

  before.ids.forEach((id, index) => {
    const next = afterIndexById.get(id);
    if (next === undefined) {
      if (alpha < 1) agents.push(agentAt(before, index));
      return;
    }
    const agent = agentAt(source, source === before ? index : next);
    const b = index * 4;
    const a = next * 4;
    agent.x = lerp(before.motion[b], after.motion[a], alpha);
    agent.y = lerp(before.motion[b + 1], after.motion[a + 1], alpha);
    agent.vx = lerp(before.motion[b + 2], after.motion[a + 2], alpha);
    agent.vy = lerp(before.motion[b + 3], after.motion[a + 3], alpha);
    agent.targetX = agent.x;
    agent.targetY = agent.y;
    agents.push(agent);
  });
  if (before !== after) {
    const beforeIds = new Set(before.ids);
    after.ids.forEach((id, index) => {
      if (!beforeIds.has(id) && alpha > 0) agents.push(agentAt(after, index));
    });
  }

  return replaySnapshot(time, agents, (alpha < 0.5 ? before : after).exitedCount);
}

export function summarizeTrajectoryRecording(recording: TrajectoryRecording) {
  const uniqueAgentIds = new Set<number>();
  let maxAgentsInFrame = 0;
  for (const frame of recording.frames) {
    frame.ids.forEach((id) => uniqueAgentIds.add(id));
    maxAgentsInFrame = Math.max(maxAgentsInFrame, frame.ids.length);
  }

  return {
    durationSeconds: Number(recording.durationSeconds.toFixed(2)),
    frameCount: recording.frames.length,
    maxAgentsInFrame,
    uniqueAgentCount: uniqueAgentIds.size,
  };
}

/**
 * Every sample as a row: the per-person trajectory table pedestrian
 * researchers exchange (one row per person per time step, metres, seconds).
 */
export function trajectoryCsv(recording: TrajectoryRecording): string {
  const lines = ["agent_id,time_s,x_m,y_m,vx_mps,vy_mps,state"];
  for (const frame of recording.frames) {
    const time = frame.elapsedSeconds.toFixed(2);
    frame.ids.forEach((id, index) => {
      const m = index * 4;
      lines.push(
        [
          id,
          time,
          frame.motion[m].toFixed(3),
          frame.motion[m + 1].toFixed(3),
          frame.motion[m + 2].toFixed(3),
          frame.motion[m + 3].toFixed(3),
          agentStateKey({ behaviorState: frame.states[index] }),
        ].join(","),
      );
    });
  }
  return `${lines.join("\r\n")}\r\n`;
}

export function packTrajectoryRecording(
  recording: TrajectoryRecording,
  quantization = 100,
): PackedTrajectoryRecording {
  const previousById = new Map<number, number[]>();
  const q = (value: number) => Math.round(value * quantization);

  return {
    durationSeconds: recording.durationSeconds,
    frames: recording.frames.map((frame) => ({
      a: Array.from(frame.ids, (id, index): PackedAgentDelta => {
        const m = index * 4;
        const current = [0, 1, 2, 3].map((lane) => q(frame.motion[m + lane]));
        const previous = previousById.get(id) ?? [0, 0, 0, 0];
        previousById.set(id, current);
        return [
          id,
          current[0] - previous[0],
          current[1] - previous[1],
          current[2] - previous[2],
          current[3] - previous[3],
          frame.states[index],
        ];
      }),
      e: frame.exitedCount,
      t: q(frame.elapsedSeconds),
    })),
    id: recording.id,
    q: quantization,
    runtime: recording.runtime,
    sceneId: recording.sceneId,
    seed: recording.seed,
    startedAtIso: recording.startedAtIso,
    version: 2,
  };
}

export function unpackTrajectoryRecording(
  packed: PackedTrajectoryRecording,
): TrajectoryRecording {
  const previousById = new Map<number, number[]>();
  let sampleCount = 0;

  const frames = packed.frames.map((frame): TrajectoryFrame => {
    const count = frame.a.length;
    const ids = new Int32Array(count);
    const motion = new Float32Array(count * 4);
    const states = new Uint8Array(count);
    frame.a.forEach(([id, ...rest], index) => {
      const previous = previousById.get(id) ?? [0, 0, 0, 0];
      const current = previous.map((value, lane) => value + rest[lane]);
      previousById.set(id, current);
      ids[index] = id;
      current.forEach((value, lane) => (motion[index * 4 + lane] = value / packed.q));
      states[index] = rest[4];
    });
    sampleCount += count;
    return {
      elapsedSeconds: frame.t / packed.q,
      exitedCount: frame.e,
      ids,
      motion,
      states,
    };
  });

  return {
    durationSeconds: packed.durationSeconds,
    frames,
    id: packed.id,
    runtime: packed.runtime,
    sampleCount,
    sceneId: packed.sceneId,
    seed: packed.seed,
    startedAtIso: packed.startedAtIso,
  };
}

export function estimatePackedTrajectoryBytes(packed: PackedTrajectoryRecording) {
  return JSON.stringify(packed).length;
}

function createFrame(snapshot: SimulationSnapshot): TrajectoryFrame {
  const count = snapshot.agents.length;
  const ids = new Int32Array(count);
  const motion = new Float32Array(count * 4);
  const states = new Uint8Array(count);
  snapshot.agents.forEach((agent, index) => {
    ids[index] = agent.id;
    motion.set([agent.x, agent.y, agent.vx, agent.vy], index * 4);
    states[index] = agentStateCode(agent.lifecycleState);
  });
  return {
    elapsedSeconds: snapshot.elapsedSeconds,
    exitedCount: snapshot.exitedCount,
    ids,
    motion,
    states,
  };
}

function agentAt(frame: TrajectoryFrame, index: number): SimulationAgent {
  const m = index * 4;
  const x = frame.motion[m];
  const y = frame.motion[m + 1];
  const state = agentStateKey({ behaviorState: frame.states[index] });
  return {
    id: frame.ids[index],
    lifecycleState: state === "unknown" ? undefined : state,
    targetX: x,
    targetY: y,
    vx: frame.motion[m + 2],
    vy: frame.motion[m + 3],
    x,
    y,
  };
}

function replaySnapshot(
  elapsedSeconds: number,
  agents: SimulationAgent[],
  exitedCount: number,
): SimulationSnapshot {
  return {
    agentCount: agents.length,
    agents,
    elapsedSeconds,
    exitedCount,
    spawnedCount: agents.length + exitedCount,
    status: "paused",
    stepCount: 0,
    timeScale: 1,
  };
}

function firstFrameAtOrAfter(frames: readonly TrajectoryFrame[], time: number) {
  let low = 0;
  let high = frames.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (frames[middle].elapsedSeconds < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

function lerp(start: number, end: number, alpha: number) {
  return start + (end - start) * alpha;
}
