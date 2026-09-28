import { describe, expect, it } from "vitest";
import { rimeaCoreScenarios } from "./benchmarkScenarios";
import type { ScenarioRunSnapshot } from "./scenarioDiffReport";
import {
  runScenarioDiffInWorker,
  scenarioDiffScenarioOptions,
  type ScenarioDiffWorkerLike,
  type ScenarioDiffWorkerRequest,
  type ScenarioDiffWorkerResponse,
} from "./scenarioDiffWorkerClient";

function fakeSnapshot(id: string, name: string): ScenarioRunSnapshot {
  return {
    id,
    name,
    summary: {
      elapsedSeconds: 10,
      flows: [],
      journeys: { count: 1, meanSeconds: 1, p50Seconds: 1, p90Seconds: 1 },
      levelOfService: {
        current: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 },
        peakAt: null,
        peakDensity: 0.1,
        peakLevel: "A",
        shareDOrWorse: 0,
      },
      places: [],
      samples: 10,
    },
  };
}

describe("scenario diff worker client", () => {
  it("lists exactly the built-in rimea scenarios as picker options", () => {
    expect(scenarioDiffScenarioOptions).toEqual(
      rimeaCoreScenarios.map((scenario) => ({ id: scenario.id, name: scenario.name })),
    );
  });

  it("falls back to running in-process when Worker is unavailable", async () => {
    const { scenarioA, scenarioB } = await runScenarioDiffInWorker(
      {
        evacuate: false,
        scenarioAId: rimeaCoreScenarios[0].id,
        scenarioBId: rimeaCoreScenarios[1].id,
      },
      { workerFactory: undefined },
    );

    expect(scenarioA.id).toBe(rimeaCoreScenarios[0].id);
    expect(scenarioB.id).toBe(rimeaCoreScenarios[1].id);
    expect(scenarioA.summary.samples).toBeGreaterThan(0);
  });

  it("resolves fake worker completion messages", async () => {
    const worker = new FakeScenarioDiffWorker();
    const { scenarioA, scenarioB } = await runScenarioDiffInWorker(
      {
        evacuate: true,
        scenarioAId: "rimea-straight-corridor",
        scenarioBId: "rimea-bottleneck",
      },
      { workerFactory: () => worker },
    );

    expect(worker.messages[0]).toMatchObject({
      evacuate: true,
      scenarioAId: "rimea-straight-corridor",
      scenarioBId: "rimea-bottleneck",
      type: "run",
    });
    expect(worker.terminated).toBe(true);
    expect(scenarioA.id).toBe("fake-a");
    expect(scenarioB.id).toBe("fake-b");
  });

  it("rejects when the worker reports an error", async () => {
    const worker = new FakeScenarioDiffWorker(true);

    await expect(
      runScenarioDiffInWorker(
        { evacuate: false, scenarioAId: "x", scenarioBId: "y" },
        { workerFactory: () => worker },
      ),
    ).rejects.toThrow("boom");
  });
});

class FakeScenarioDiffWorker implements ScenarioDiffWorkerLike {
  messages: ScenarioDiffWorkerRequest[] = [];
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessage: ((event: MessageEvent<ScenarioDiffWorkerResponse>) => void) | null = null;
  terminated = false;

  constructor(private readonly fail = false) {}

  postMessage(message: ScenarioDiffWorkerRequest) {
    this.messages.push(message);

    queueMicrotask(() => {
      if (this.fail) {
        this.emit({ message: "boom", type: "error" });
        return;
      }

      this.emit({
        scenarioA: fakeSnapshot("fake-a", "Fake A"),
        scenarioB: fakeSnapshot("fake-b", "Fake B"),
        type: "complete",
      });
    });
  }

  terminate() {
    this.terminated = true;
  }

  private emit(message: ScenarioDiffWorkerResponse) {
    this.onmessage?.({ data: message } as MessageEvent<ScenarioDiffWorkerResponse>);
  }
}
