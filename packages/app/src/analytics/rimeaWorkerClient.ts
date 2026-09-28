import { runRimeaSuite, type RimeaTestResult } from "./rimeaSuite";

/**
 * Running the RiMEA suite off the main thread.
 *
 * Test 4 fills a periodic corridor at five densities and settles each one, so
 * it is seconds of solid arithmetic — enough to freeze the page if it ran
 * where the crowd is drawn. Same shape as the experiment worker beside it.
 */

export type RimeaWorkerResponse =
  | { results: RimeaTestResult[]; type: "complete" }
  | { message: string; type: "error" };

export type RimeaWorkerLike = {
  onerror: ((event: ErrorEvent) => void) | null;
  onmessage: ((event: MessageEvent<RimeaWorkerResponse>) => void) | null;
  postMessage: (message: { type: "run" }) => void;
  terminate: () => void;
};

export function createRimeaWorker(): RimeaWorkerLike {
  return new Worker(new URL("./rimea.worker.ts", import.meta.url), {
    name: "crowdsim-rimea-worker",
    type: "module",
  });
}

export async function runRimeaSuiteInWorker(
  options: { workerFactory?: () => RimeaWorkerLike } = {},
): Promise<readonly RimeaTestResult[]> {
  // Somewhere without workers: run it here instead. Slower for the caller,
  // same answer.
  if (!options.workerFactory && typeof Worker === "undefined") {
    return runRimeaSuite();
  }

  const worker = options.workerFactory?.() ?? createRimeaWorker();

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
      finish(() => reject(new Error(event.message || "RiMEA worker failed")));
    };
    worker.postMessage({ type: "run" });
  });
}
