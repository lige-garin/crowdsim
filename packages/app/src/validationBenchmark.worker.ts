import { rimeaCoreScenarios } from "./benchmarkScenarios";
import { runBenchmarkSuite } from "./benchmarkRunner";
import type { ValidationBenchmarkWorkerResponse } from "./validationBenchmarkWorkerClient";

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<{ type: "run" }>) => void) | null;
  postMessage: (message: ValidationBenchmarkWorkerResponse) => void;
};

workerScope.onmessage = () => {
  try {
    workerScope.postMessage({
      results: runBenchmarkSuite(rimeaCoreScenarios),
      type: "complete",
    });
  } catch (error) {
    workerScope.postMessage({
      message: error instanceof Error ? error.message : "Validation benchmark failed",
      type: "error",
    });
  }
};
