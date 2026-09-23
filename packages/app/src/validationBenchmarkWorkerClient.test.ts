import { describe, expect, it } from "vitest";
import {
  runValidationBenchmarksInWorker,
  type ValidationBenchmarkWorkerLike,
  type ValidationBenchmarkWorkerResponse,
} from "./validationBenchmarkWorkerClient";
import type { BenchmarkRunResult } from "./benchmarkTypes";

function fakeResult(scenarioId: string): BenchmarkRunResult {
  return {
    comparisons: [],
    densityPeak: 0.1,
    durationSeconds: 1,
    elapsedSeconds: 1,
    exitedCount: 1,
    meanSpeedMetersPerSecond: 1.3,
    pass: true,
    remainingAgents: 0,
    reproducibilityHash: "fake",
    runtime: {
      decisionBackend: "rule-ts",
      decisionHz: 10,
      movementBackend: "cpu-compat",
      movementHz: 60,
      sharedMemory: "fallback",
      thread: "main",
    },
    scenarioId,
    scenarioName: scenarioId,
    spawnedCount: 1,
    stepCount: 1,
    throughputPerMinute: 60,
  };
}

describe("validation benchmark worker client", () => {
  it("sends a bare run request and resolves fake worker results", async () => {
    const worker = new FakeValidationBenchmarkWorker();
    const results = await runValidationBenchmarksInWorker({
      workerFactory: () => worker,
    });

    expect(worker.messages).toEqual([{ type: "run" }]);
    expect(worker.terminated).toBe(true);
    expect(results.map((result) => result.scenarioId)).toEqual(["fake-a", "fake-b"]);
  });

  it("rejects when the worker reports an error", async () => {
    const worker = new FakeValidationBenchmarkWorker(true);

    await expect(
      runValidationBenchmarksInWorker({ workerFactory: () => worker }),
    ).rejects.toThrow("boom");
  });

  it("falls back to running in-process when Worker is unavailable", async () => {
    // No workerFactory and no global Worker in this environment: exercises
    // the same code path a browser without SharedArrayBuffer/Worker support
    // would hit. Real (small) computation, not a fake.
    const results = await runValidationBenchmarksInWorker();
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => typeof result.pass === "boolean")).toBe(true);
  }, 30_000);
});

class FakeValidationBenchmarkWorker implements ValidationBenchmarkWorkerLike {
  messages: { type: "run" }[] = [];
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessage: ((event: MessageEvent<ValidationBenchmarkWorkerResponse>) => void) | null =
    null;
  terminated = false;

  constructor(private readonly fail = false) {}

  postMessage(message: { type: "run" }) {
    this.messages.push(message);

    queueMicrotask(() => {
      if (this.fail) {
        this.emit({ message: "boom", type: "error" });
        return;
      }

      this.emit({
        results: [fakeResult("fake-a"), fakeResult("fake-b")],
        type: "complete",
      });
    });
  }

  terminate() {
    this.terminated = true;
  }

  private emit(message: ValidationBenchmarkWorkerResponse) {
    this.onmessage?.({
      data: message,
    } as MessageEvent<ValidationBenchmarkWorkerResponse>);
  }
}
