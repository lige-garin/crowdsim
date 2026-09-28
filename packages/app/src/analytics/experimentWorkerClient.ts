import { runExperimentQueue, type ExperimentQueueProgress } from "./experimentQueue";
import type { ExperimentDefinition, ExperimentRunResult } from "./experimentRunner";

export type ExperimentWorkerRunRequest = {
  execution: "serial";
  experiment: ExperimentDefinition;
  mode: "headless-no-render";
  totalJobs: number;
  type: "run-experiment";
};

export type ExperimentWorkerRequest =
  | ExperimentWorkerRunRequest
  | {
      type: "abort";
    };

export type ExperimentWorkerResponse =
  | {
      progress: ExperimentQueueProgress;
      type: "progress";
    }
  | {
      results: ExperimentRunResult[];
      type: "complete";
    }
  | {
      message: string;
      type: "error";
    };

export type ExperimentWorkerLike = {
  onerror: ((event: ErrorEvent) => void) | null;
  onmessage: ((event: MessageEvent<ExperimentWorkerResponse>) => void) | null;
  postMessage: (message: ExperimentWorkerRequest) => void;
  terminate: () => void;
};

export function createExperimentWorkerRequest(
  experiment: ExperimentDefinition,
): ExperimentWorkerRunRequest {
  return {
    execution: "serial",
    experiment,
    mode: "headless-no-render",
    totalJobs:
      Math.max(1, Math.floor(experiment.replications)) * experiment.variants.length,
    type: "run-experiment",
  };
}

export function createExperimentWorker(): ExperimentWorkerLike {
  return new Worker(new URL("./experiment.worker.ts", import.meta.url), {
    name: "crowdsim-experiment-worker",
    type: "module",
  });
}

export async function runExperimentInBackgroundWorker(
  experiment: ExperimentDefinition,
  options: {
    onProgress?: (progress: ExperimentQueueProgress) => void;
    signal?: AbortSignal;
    workerFactory?: (() => ExperimentWorkerLike) | null;
  } = {},
): Promise<ExperimentRunResult[]> {
  if (
    options.workerFactory === null ||
    (!options.workerFactory && typeof Worker === "undefined")
  ) {
    return runExperimentQueue(experiment, {
      onProgress: options.onProgress,
      signal: options.signal,
    });
  }

  if (options.signal?.aborted) {
    throw new Error("Experiment worker aborted");
  }

  const worker = options.workerFactory?.() ?? createExperimentWorker();

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      worker.onmessage = null;
      worker.onerror = null;
      options.signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      callback();
    };
    const abort = () => {
      worker.postMessage({ type: "abort" });
      finish(() => reject(new Error("Experiment worker aborted")));
    };

    worker.onmessage = (event) => {
      const message = event.data;

      if (message.type === "progress") {
        options.onProgress?.(message.progress);
        return;
      }

      if (message.type === "complete") {
        finish(() => resolve(message.results));
        return;
      }

      finish(() => reject(new Error(message.message)));
    };
    worker.onerror = (event) => {
      finish(() => reject(new Error(event.message || "Experiment worker failed")));
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    worker.postMessage(createExperimentWorkerRequest(experiment));
  });
}
