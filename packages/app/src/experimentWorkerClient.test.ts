import { describe, expect, it } from "vitest";
import { rimeaCoreScenarios } from "./benchmarkScenarios";
import { createExperimentFromSweep } from "./experimentSweep";
import {
  createExperimentWorkerRequest,
  runExperimentInBackgroundWorker,
  type ExperimentWorkerLike,
  type ExperimentWorkerRequest,
  type ExperimentWorkerResponse,
} from "./experimentWorkerClient";

function createWorkerExperiment() {
  return createExperimentFromSweep({
    id: "worker-speed-sweep",
    name: "Worker speed sweep",
    parameter: {
      end: 1.2,
      kind: "speed",
      start: 0.9,
      step: 0.3,
    },
    replications: 1,
    scenario: rimeaCoreScenarios[0],
  });
}

describe("experiment worker client", () => {
  it("creates a serial headless no-render worker request", () => {
    const request = createExperimentWorkerRequest(createWorkerExperiment());

    expect(request).toMatchObject({
      execution: "serial",
      mode: "headless-no-render",
      totalJobs: 2,
      type: "run-experiment",
    });
  });

  it("falls back to the serial queue when Worker is unavailable", async () => {
    const progress: number[] = [];
    const results = await runExperimentInBackgroundWorker(createWorkerExperiment(), {
      onProgress: (item) => progress.push(item.completed / item.total),
      workerFactory: null,
    });

    expect(results).toHaveLength(2);
    expect(progress).toEqual([0.5, 1]);
  });

  it("resolves fake worker progress and completion messages", async () => {
    const progress: number[] = [];
    const worker = new FakeExperimentWorker();
    const results = await runExperimentInBackgroundWorker(createWorkerExperiment(), {
      onProgress: (item) => progress.push(item.completed / item.total),
      workerFactory: () => worker,
    });

    expect(worker.messages[0]).toMatchObject({
      mode: "headless-no-render",
      type: "run-experiment",
    });
    expect(worker.terminated).toBe(true);
    expect(progress).toEqual([0.5, 1]);
    expect(results).toHaveLength(1);
    expect(results[0].variantId).toBe("fake-worker");
  });
});

class FakeExperimentWorker implements ExperimentWorkerLike {
  messages: ExperimentWorkerRequest[] = [];
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessage: ((event: MessageEvent<ExperimentWorkerResponse>) => void) | null = null;
  terminated = false;

  postMessage(message: ExperimentWorkerRequest) {
    this.messages.push(message);

    if (message.type !== "run-experiment") {
      return;
    }

    queueMicrotask(() => {
      this.emit({ progress: { completed: 1, total: 2 }, type: "progress" });
      this.emit({ progress: { completed: 2, total: 2 }, type: "progress" });
      this.emit({
        results: [
          {
            benchmark: {
              comparisons: [],
              densityPeak: 0,
              durationSeconds: 1,
              elapsedSeconds: 1,
              exitedCount: 1,
              meanSpeedMetersPerSecond: 1,
              pass: true,
              remainingAgents: 0,
              reproducibilityHash: "fake",
              scenarioId: "fake",
              scenarioName: "Fake",
              spawnedCount: 1,
              stepCount: 1,
              throughputPerMinute: 60,
            },
            experimentId: "worker-speed-sweep",
            replicationIndex: 0,
            variantId: "fake-worker",
            variantName: "Fake worker",
          },
        ],
        type: "complete",
      });
    });
  }

  terminate() {
    this.terminated = true;
  }

  private emit(message: ExperimentWorkerResponse) {
    this.onmessage?.({ data: message } as MessageEvent<ExperimentWorkerResponse>);
  }
}
