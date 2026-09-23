import { rimeaCoreScenarios } from "./benchmarkScenarios";
import { runBenchmarkSuite } from "./benchmarkRunner";
import type { BenchmarkRunResult } from "./benchmarkTypes";

/**
 * Running the validation report's own benchmark suite off the main thread.
 *
 * `createValidationReport` used to call `runBenchmarkSuite` directly inside
 * a `useMemo` during render -- four ~90-100s scenarios, thousands of
 * physics steps, synchronously, freezing the page every time the panel
 * mounted or the scene changed. Same shape as `rimeaWorkerClient.ts`: a
 * bounded headless computation, no progress or cancellation needed.
 */

export type ValidationBenchmarkWorkerResponse =
  | { results: BenchmarkRunResult[]; type: "complete" }
  | { message: string; type: "error" };

export type ValidationBenchmarkWorkerLike = {
  onerror: ((event: ErrorEvent) => void) | null;
  onmessage: ((event: MessageEvent<ValidationBenchmarkWorkerResponse>) => void) | null;
  postMessage: (message: { type: "run" }) => void;
  terminate: () => void;
};

export function createValidationBenchmarkWorker(): ValidationBenchmarkWorkerLike {
  return new Worker(new URL("./validationBenchmark.worker.ts", import.meta.url), {
    name: "crowdsim-validation-benchmark-worker",
    type: "module",
  });
}

export async function runValidationBenchmarksInWorker(
  options: { workerFactory?: () => ValidationBenchmarkWorkerLike } = {},
): Promise<BenchmarkRunResult[]> {
  // Somewhere without workers: run it here instead. Slower for the caller,
  // same answer.
  if (!options.workerFactory && typeof Worker === "undefined") {
    return runBenchmarkSuite(rimeaCoreScenarios);
  }

  const worker = options.workerFactory?.() ?? createValidationBenchmarkWorker();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      callback();
    };

    worker.onmessage = (event) => {
      const message = event.data;

      if (message.type === "complete") {
        finish(() => resolve(message.results));
        return;
      }

      finish(() => reject(new Error(message.message)));
    };
    worker.onerror = (event) => {
      finish(() =>
        reject(new Error(event.message || "Validation benchmark worker failed")),
      );
    };
    worker.postMessage({ type: "run" });
  });
}
