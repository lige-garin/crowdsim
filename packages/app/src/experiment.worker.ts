import { runExperimentQueue } from "./experimentQueue";
import type {
  ExperimentWorkerRequest,
  ExperimentWorkerResponse,
} from "./experimentWorkerClient";

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<ExperimentWorkerRequest>) => void) | null;
  postMessage: (message: ExperimentWorkerResponse) => void;
};

let activeController: AbortController | null = null;

workerScope.onmessage = (event) => {
  const message = event.data;

  if (message.type === "abort") {
    activeController?.abort();
    return;
  }

  activeController = new AbortController();
  runExperimentQueue(message.experiment, {
    onProgress: (progress) => {
      workerScope.postMessage({
        progress,
        type: "progress",
      });
    },
    signal: activeController.signal,
  })
    .then((results) => {
      workerScope.postMessage({
        results,
        type: "complete",
      });
    })
    .catch((error) => {
      workerScope.postMessage({
        message: error instanceof Error ? error.message : "Experiment worker failed",
        type: "error",
      });
    });
};
