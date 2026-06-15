import type { SimulationSnapshot } from "./simulationEngine";

export type RecordedAgent = {
  id: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
};

export type TrajectoryFrame = {
  agents: RecordedAgent[];
  elapsedSeconds: number;
};

export type TrajectoryRecording = {
  durationSeconds: number;
  frames: TrajectoryFrame[];
  id: string;
  sceneId: string;
  seed: number;
  startedAtIso: string;
};

export type TrajectoryRecordingInput = {
  id: string;
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
];

export type PackedTrajectoryFrame = {
  a: PackedAgentDelta[];
  t: number;
};

export type PackedTrajectoryRecording = {
  durationSeconds: number;
  frames: PackedTrajectoryFrame[];
  id: string;
  q: number;
  sceneId: string;
  seed: number;
  startedAtIso: string;
  version: 1;
};

export function createTrajectoryRecording(
  input: TrajectoryRecordingInput,
): TrajectoryRecording {
  return {
    durationSeconds: 0,
    frames: [],
    id: input.id,
    sceneId: input.sceneId,
    seed: input.seed,
    startedAtIso: input.startedAtIso ?? new Date().toISOString(),
  };
}

export function appendTrajectoryFrame(
  recording: TrajectoryRecording,
  snapshot: SimulationSnapshot,
  options: { maxFrames?: number } = {},
): TrajectoryRecording {
  const maxFrames = Math.max(1, options.maxFrames ?? 900);
  const frame = createFrame(snapshot);
  const frames = [...recording.frames, frame].slice(-maxFrames);

  return {
    ...recording,
    durationSeconds:
      frames.length > 0
        ? frames[frames.length - 1].elapsedSeconds - frames[0].elapsedSeconds
        : 0,
    frames,
  };
}

export function replayTrajectoryAt(
  recording: TrajectoryRecording,
  elapsedSeconds: number,
): TrajectoryFrame {
  if (recording.frames.length === 0) {
    return {
      agents: [],
      elapsedSeconds,
    };
  }

  const clampedElapsed = clamp(
    elapsedSeconds,
    recording.frames[0].elapsedSeconds,
    recording.frames[recording.frames.length - 1].elapsedSeconds,
  );
  const afterIndex = recording.frames.findIndex(
    (frame) => frame.elapsedSeconds >= clampedElapsed,
  );

  if (afterIndex <= 0) {
    return cloneFrame(recording.frames[0], clampedElapsed);
  }

  const before = recording.frames[afterIndex - 1];
  const after = recording.frames[afterIndex];
  const span = after.elapsedSeconds - before.elapsedSeconds;
  const alpha = span > 0 ? (clampedElapsed - before.elapsedSeconds) / span : 0;

  return {
    agents: interpolateAgents(before.agents, after.agents, alpha),
    elapsedSeconds: clampedElapsed,
  };
}

export function summarizeTrajectoryRecording(recording: TrajectoryRecording) {
  const uniqueAgentIds = new Set<number>();

  for (const frame of recording.frames) {
    for (const agent of frame.agents) {
      uniqueAgentIds.add(agent.id);
    }
  }

  return {
    durationSeconds: Number(recording.durationSeconds.toFixed(2)),
    frameCount: recording.frames.length,
    maxAgentsInFrame: Math.max(
      0,
      ...recording.frames.map((frame) => frame.agents.length),
    ),
    uniqueAgentCount: uniqueAgentIds.size,
  };
}

export function packTrajectoryRecording(
  recording: TrajectoryRecording,
  quantization = 100,
): PackedTrajectoryRecording {
  const previousById = new Map<number, QuantizedAgent>();

  return {
    durationSeconds: recording.durationSeconds,
    frames: recording.frames.map((frame) => ({
      a: frame.agents.map((agent) => {
        const current = quantizeAgent(agent, quantization);
        const previous = previousById.get(agent.id) ?? emptyQuantizedAgent(agent.id);

        previousById.set(agent.id, current);

        return [
          agent.id,
          current.x - previous.x,
          current.y - previous.y,
          current.vx - previous.vx,
          current.vy - previous.vy,
        ];
      }),
      t: Math.round(frame.elapsedSeconds * quantization),
    })),
    id: recording.id,
    q: quantization,
    sceneId: recording.sceneId,
    seed: recording.seed,
    startedAtIso: recording.startedAtIso,
    version: 1,
  };
}

export function unpackTrajectoryRecording(
  packed: PackedTrajectoryRecording,
): TrajectoryRecording {
  const previousById = new Map<number, QuantizedAgent>();

  return {
    durationSeconds: packed.durationSeconds,
    frames: packed.frames.map((frame) => ({
      agents: frame.a.map(([id, dx, dy, dvx, dvy]) => {
        const previous = previousById.get(id) ?? emptyQuantizedAgent(id);
        const current = {
          id,
          vx: previous.vx + dvx,
          vy: previous.vy + dvy,
          x: previous.x + dx,
          y: previous.y + dy,
        };

        previousById.set(id, current);

        return {
          id,
          vx: round(current.vx / packed.q),
          vy: round(current.vy / packed.q),
          x: round(current.x / packed.q),
          y: round(current.y / packed.q),
        };
      }),
      elapsedSeconds: round(frame.t / packed.q),
    })),
    id: packed.id,
    sceneId: packed.sceneId,
    seed: packed.seed,
    startedAtIso: packed.startedAtIso,
  };
}

export function estimatePackedTrajectoryBytes(packed: PackedTrajectoryRecording) {
  return JSON.stringify(packed).length;
}

function createFrame(snapshot: SimulationSnapshot): TrajectoryFrame {
  return {
    agents: snapshot.agents.map((agent) => ({
      id: agent.id,
      vx: round(agent.vx),
      vy: round(agent.vy),
      x: round(agent.x),
      y: round(agent.y),
    })),
    elapsedSeconds: round(snapshot.elapsedSeconds),
  };
}

type QuantizedAgent = {
  id: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
};

function quantizeAgent(agent: RecordedAgent, quantization: number): QuantizedAgent {
  return {
    id: agent.id,
    vx: Math.round(agent.vx * quantization),
    vy: Math.round(agent.vy * quantization),
    x: Math.round(agent.x * quantization),
    y: Math.round(agent.y * quantization),
  };
}

function emptyQuantizedAgent(id: number): QuantizedAgent {
  return {
    id,
    vx: 0,
    vy: 0,
    x: 0,
    y: 0,
  };
}

function interpolateAgents(
  beforeAgents: readonly RecordedAgent[],
  afterAgents: readonly RecordedAgent[],
  alpha: number,
) {
  const afterById = new Map(afterAgents.map((agent) => [agent.id, agent]));

  return beforeAgents
    .map((before) => {
      const after = afterById.get(before.id);

      if (!after) {
        return before;
      }

      return {
        id: before.id,
        vx: lerp(before.vx, after.vx, alpha),
        vy: lerp(before.vy, after.vy, alpha),
        x: lerp(before.x, after.x, alpha),
        y: lerp(before.y, after.y, alpha),
      };
    })
    .map((agent) => ({
      ...agent,
      vx: round(agent.vx),
      vy: round(agent.vy),
      x: round(agent.x),
      y: round(agent.y),
    }));
}

function cloneFrame(frame: TrajectoryFrame, elapsedSeconds: number): TrajectoryFrame {
  return {
    agents: frame.agents.map((agent) => ({ ...agent })),
    elapsedSeconds,
  };
}

function lerp(start: number, end: number, alpha: number) {
  return start + (end - start) * alpha;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number) {
  return Number(value.toFixed(4));
}
