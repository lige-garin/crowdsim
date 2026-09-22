import { runRimeaSuite } from "./rimeaSuite";
import type { RimeaWorkerResponse } from "./rimeaWorkerClient";

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<{ type: "run" }>) => void) | null;
  postMessage: (message: RimeaWorkerResponse) => void;
};

workerScope.onmessage = () => {
  try {
    workerScope.postMessage({ results: [...runRimeaSuite()], type: "complete" });
  } catch (error) {
    workerScope.postMessage({
      message: error instanceof Error ? error.message : "RiMEA suite failed",
      type: "error",
    });
  }
};
