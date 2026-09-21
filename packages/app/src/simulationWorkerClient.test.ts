import { describe, expect, it } from "vitest";
import { demoScene } from "./demoScene";
import {
  createSimulationSharedMemory,
  createSimulationWorkerClient,
  readSimulationSharedAgents,
  readSimulationSharedMemory,
  simulationWorkerDisposedMessage,
  writeSimulationSharedMemory,
  type SimulationWorkerLike,
  type SimulationWorkerRequest,
  type SimulationWorkerResponse,
} from "./simulationWorkerClient";

describe("simulation worker client", () => {
  it("creates SharedArrayBuffer metrics when isolation is available", () => {
    const sharedMemory = createSimulationSharedMemory({
      Atomics,
      SharedArrayBuffer,
      crossOriginIsolated: true,
    } as typeof globalThis);

    expect(sharedMemory?.capacity).toBe(2000);
    expect(sharedMemory!.buffer.byteLength).toBeGreaterThan(24);
    expect(readSimulationSharedMemory(sharedMemory!)).toMatchObject({
      agentCount: 0,
      capacity: 2000,
      status: "paused",
      version: 1,
    });
  });

  it("writes live agent SoA lanes into SharedArrayBuffer", () => {
    const sharedMemory = createSimulationSharedMemory(
      {
        Atomics,
        SharedArrayBuffer,
        crossOriginIsolated: true,
      } as typeof globalThis,
      2,
    )!;

    writeSimulationSharedMemory(
      sharedMemory,
      {
        agentCount: 2,
        agents: [
          {
            id: 11,
            lifecycleState: "queue",
            targetX: 9,
            targetY: 4,
            vx: 1.5,
            vy: -0.5,
            x: 2,
            y: 3,
          },
          {
            floorId: "upper",
            id: 12,
            lifecycleState: "evacuate",
            targetX: 7,
            targetY: 8,
            vx: 0,
            vy: 2,
            x: 5,
            y: 6,
          },
        ],
        elapsedSeconds: 1.25,
        exitedCount: 1,
        spawnedCount: 3,
        status: "running",
        stepCount: 75,
        timeScale: 1,
      },
      ["ground", "upper"],
    );

    expect(readSimulationSharedMemory(sharedMemory)).toMatchObject({
      agentCount: 2,
      elapsedMilliseconds: 1250,
      stepCount: 75,
    });
    expect(readSimulationSharedAgents(sharedMemory).agents).toEqual([
      {
        behaviorState: 3,
        flags: 1,
        floorIndex: -1,
        id: 11,
        targetX: 9,
        targetY: 4,
        vx: 1.5,
        vy: -0.5,
        x: 2,
        y: 3,
      },
      {
        behaviorState: 6,
        flags: 1,
        floorIndex: 1,
        id: 12,
        targetX: 7,
        targetY: 8,
        vx: 0,
        vy: 2,
        x: 5,
        y: 6,
      },
    ]);
  });

  it("falls back to inline simulation when Worker is unavailable", async () => {
    const sharedMemory = createSimulationSharedMemory({
      Atomics,
      SharedArrayBuffer,
      crossOriginIsolated: true,
    } as typeof globalThis);
    const client = createSimulationWorkerClient({ workerFactory: null });

    await client.init(demoScene, {
      sharedMemory,
      simulation: { fixedDtSeconds: 0.25 },
    });
    await client.start();
    // Arrivals are random: run a few simulated seconds so someone has come.
    let snapshot = await client.tick(0.25);
    while (snapshot.spawnedCount === 0 && snapshot.stepCount < 40) {
      snapshot = await client.tick(0.25);
    }

    expect(snapshot.spawnedCount).toBeGreaterThan(0);
    expect(readSimulationSharedMemory(sharedMemory!)).toMatchObject({
      agentCount: snapshot.agentCount,
      status: "running",
      stepCount: snapshot.stepCount,
    });
    expect(readSimulationSharedAgents(sharedMemory!).agents.length).toBe(
      snapshot.agentCount,
    );

    client.dispose();
  });

  it("resolves fake worker snapshots by request id", async () => {
    const worker = new FakeSimulationWorker();
    const client = createSimulationWorkerClient({
      workerFactory: () => worker,
    });

    const snapshot = await client.init(demoScene);

    expect(snapshot.stepCount).toBe(0);
    expect(worker.messages[0]).toMatchObject({
      scene: demoScene,
      type: "init",
    });

    const running = await client.start();

    expect(running.status).toBe("running");

    client.dispose();
    expect(worker.terminated).toBe(true);
  });

  it("rejects requests the terminated worker will never answer", async () => {
    const worker = new SilentSimulationWorker();
    const client = createSimulationWorkerClient({ workerFactory: () => worker });
    const inFlight = client.tick(1 / 60);

    client.dispose();

    // A dropped request never settles, so the caller's `.finally` never runs:
    // that is the silent freeze this rejection exists to prevent.
    await expect(inFlight).rejects.toThrow(simulationWorkerDisposedMessage);
    await expect(client.start()).rejects.toThrow(simulationWorkerDisposedMessage);
    expect(worker.terminated).toBe(true);
  });

  it("rejects inline commands issued before init instead of throwing", async () => {
    const client = createSimulationWorkerClient({ workerFactory: null });

    await expect(client.tick(1 / 60)).rejects.toThrow(
      "Simulation worker is not initialized",
    );
  });
});

class SilentSimulationWorker implements SimulationWorkerLike {
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessage: ((event: MessageEvent<SimulationWorkerResponse>) => void) | null = null;
  terminated = false;

  postMessage() {}

  terminate() {
    this.terminated = true;
  }
}

class FakeSimulationWorker implements SimulationWorkerLike {
  messages: SimulationWorkerRequest[] = [];
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessage: ((event: MessageEvent<SimulationWorkerResponse>) => void) | null = null;
  terminated = false;

  postMessage(message: SimulationWorkerRequest) {
    this.messages.push(message);

    queueMicrotask(() => {
      this.emit({
        id: message.id,
        snapshot: {
          agentCount: 0,
          agents: [],
          elapsedSeconds: 0,
          exitedCount: 0,
          spawnedCount: 0,
          status: message.type === "start" ? "running" : "paused",
          stepCount: 0,
          timeScale: 1,
        },
        type: "snapshot",
      });
    });
  }

  terminate() {
    this.terminated = true;
  }

  private emit(message: SimulationWorkerResponse) {
    this.onmessage?.({ data: message } as MessageEvent<SimulationWorkerResponse>);
  }
}
