import { describe, expect, it } from "vitest";
import {
  appendTrajectoryFrame,
  createTrajectoryRecording,
  estimatePackedTrajectoryBytes,
  packTrajectoryRecording,
  replayTrajectoryAt,
  summarizeTrajectoryRecording,
  trajectoryCsv,
  unpackTrajectoryRecording,
} from "./trajectoryRecording";
import type { SimulationSnapshot } from "./simulationEngine";

describe("trajectory recording", () => {
  it("records snapshots into typed arrays and drops the oldest past the sample budget", () => {
    const empty = createTrajectoryRecording({
      id: "recording-1",
      sceneId: "demo",
      seed: 42,
      startedAtIso: "2026-06-12T00:00:00.000Z",
    });
    const first = appendTrajectoryFrame(empty, snapshot(0, 1), { maxSamples: 2 });
    const second = appendTrajectoryFrame(first, snapshot(1, 2), { maxSamples: 2 });
    const third = appendTrajectoryFrame(second, snapshot(2, 3), { maxSamples: 2 });

    expect(third.frames.map((frame) => frame.elapsedSeconds)).toEqual([1, 2]);
    expect(third.durationSeconds).toBe(1);
    expect(third.sampleCount).toBe(2);
    expect(third.frames[1].ids[0]).toBe(3);
    expect(Array.from(third.frames[1].motion)).toEqual([4, 2, 1, 0]);
    expect(third.frames[1].states[0]).toBe(1);
  });

  it("interpolates replay frames between recorded snapshots", () => {
    const recording = [snapshot(0, 1), snapshot(2, 1)].reduce(
      (current, item) => appendTrajectoryFrame(current, item),
      createTrajectoryRecording({
        id: "recording-2",
        sceneId: "demo",
        seed: 42,
        startedAtIso: "2026-06-12T00:00:00.000Z",
      }),
    );
    const replay = replayTrajectoryAt(recording, 1);

    expect(replay.elapsedSeconds).toBe(1);
    expect(replay.agents[0]).toMatchObject({
      id: 1,
      x: 2,
      y: 1,
    });
  });

  it("summarizes frame count, duration, and unique agents", () => {
    const recording = [snapshot(0, 1), snapshot(2, 1), snapshot(3, 2)].reduce(
      (current, item) => appendTrajectoryFrame(current, item),
      createTrajectoryRecording({
        id: "recording-3",
        sceneId: "demo",
        seed: 42,
        startedAtIso: "2026-06-12T00:00:00.000Z",
      }),
    );

    expect(summarizeTrajectoryRecording(recording)).toEqual({
      durationSeconds: 3,
      frameCount: 3,
      maxAgentsInFrame: 1,
      uniqueAgentCount: 2,
    });
  });

  it("packs trajectory frames as quantized deltas and restores replay data", () => {
    const recording = [snapshot(0, 1), snapshot(1, 1), snapshot(2, 1)].reduce(
      (current, item) => appendTrajectoryFrame(current, item),
      createTrajectoryRecording({
        id: "recording-4",
        sceneId: "demo",
        seed: 42,
        startedAtIso: "2026-06-12T00:00:00.000Z",
      }),
    );
    const packed = packTrajectoryRecording(recording);
    const unpacked = unpackTrajectoryRecording(packed);

    expect(packed.frames[1].a[0]).toEqual([1, 200, 100, 0, 0, 1]);
    expect(estimatePackedTrajectoryBytes(packed)).toBeGreaterThan(0);
    expect(unpacked.frames).toEqual(recording.frames);
    expect(replayTrajectoryAt(unpacked, 1.5).agents[0]).toMatchObject({
      x: 3,
      y: 1.5,
    });
  });

  it("replays arrivals and state, and exports one CSV row per sample", () => {
    const recording = [snapshot(0, 1), snapshot(2, 2)].reduce(
      (current, item) => appendTrajectoryFrame(current, item),
      createTrajectoryRecording({ id: "r", sceneId: "demo", seed: 1 }),
    );

    // Person 1 left and person 2 arrived between the frames.
    expect(replayTrajectoryAt(recording, 0).agents.map((agent) => agent.id)).toEqual([
      1,
    ]);
    expect(replayTrajectoryAt(recording, 1).agents.map((agent) => agent.id)).toEqual([
      1, 2,
    ]);
    expect(replayTrajectoryAt(recording, 2).agents).toMatchObject([
      { id: 2, lifecycleState: "walk", x: 4, y: 2 },
    ]);
    expect(replayTrajectoryAt(recording, 99).elapsedSeconds).toBe(2);
    expect(trajectoryCsv(recording).split("\r\n")).toEqual([
      "agent_id,time_s,x_m,y_m,vx_mps,vy_mps,state",
      "1,0.00,0.000,0.000,1.000,0.000,walk",
      "2,2.00,4.000,2.000,1.000,0.000,walk",
      "",
    ]);
  });

  it("preserves the runtime profile through packed replay export", () => {
    const recording = createTrajectoryRecording({
      id: "recording-runtime",
      runtime: {
        decisionBackend: "wasm-ready",
        sharedMemory: "sab",
        thread: "worker",
      },
      sceneId: "demo",
      seed: 42,
      startedAtIso: "2026-06-12T00:00:00.000Z",
    });
    const packed = packTrajectoryRecording(recording);
    const unpacked = unpackTrajectoryRecording(packed);

    expect(packed.runtime).toMatchObject({
      decisionBackend: "wasm-ready",
      sharedMemory: "sab",
      thread: "worker",
    });
    expect(unpacked.runtime).toEqual(packed.runtime);
  });
});

function snapshot(elapsedSeconds: number, agentId: number): SimulationSnapshot {
  return {
    agentCount: 1,
    agents: [
      {
        id: agentId,
        lifecycleState: "walk",
        targetX: 10,
        targetY: 0,
        vx: 1,
        vy: 0,
        x: elapsedSeconds * 2,
        y: elapsedSeconds,
      },
    ],
    elapsedSeconds,
    exitedCount: 0,
    spawnedCount: agentId,
    status: "running",
    stepCount: elapsedSeconds * 10,
    timeScale: 1,
  };
}
