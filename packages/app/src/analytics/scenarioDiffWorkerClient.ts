import { rimeaCoreScenarios } from "./benchmarkScenarios";
import type { ScenarioRunSnapshot } from "./scenarioDiffReport";

/**
 * Running two scenario diffs off the main thread.
 *
 * Same shape as `rimeaWorkerClient.ts`: a bounded headless computation (two
 * scenario runs, seconds of arithmetic) with no progress or cancellation, not
 * a long sweep that needs either. Only the two scenario ids and the evacuate
 * flag cross the `postMessage` boundary — the scenarios themselves are
 * looked up from `rimeaCoreScenarios` inside the worker, the same set the
 * scenario pickers offer, so nothing but plain strings needs to be
 * structured-cloned.
 */

export type ScenarioDiffWorkerRequest = {
  evacuate: boolean;
  scenarioAId: string;
  scenarioBId: string;
  type: "run";
};

export type ScenarioDiffWorkerResponse =
  | {
      scenarioA: ScenarioRunSnapshot;
      scenarioB: ScenarioRunSnapshot;
      type: "complete";
    }
  | { message: string; type: "error" };

export type ScenarioDiffWorkerLike = {
  onerror: ((event: ErrorEvent) => void) | null;
  onmessage: ((event: MessageEvent<ScenarioDiffWorkerResponse>) => void) | null;
  postMessage: (message: ScenarioDiffWorkerRequest) => void;
  terminate: () => void;
};

export const scenarioDiffScenarioOptions = rimeaCoreScenarios.map((scenario) => ({
  id: scenario.id,
  name: scenario.name,
}));

export function createScenarioDiffWorker(): ScenarioDiffWorkerLike {
  return new Worker(new URL("./scenarioDiff.worker.ts", import.meta.url), {
    name: "crowdsim-scenario-diff-worker",
    type: "module",
  });
}

export async function runScenarioDiffInWorker(
  request: Omit<ScenarioDiffWorkerRequest, "type">,
  options: { workerFactory?: () => ScenarioDiffWorkerLike } = {},
): Promise<{ scenarioA: ScenarioRunSnapshot; scenarioB: ScenarioRunSnapshot }> {
  // Somewhere without workers: run it here instead. Slower for the caller,
  // same answer.
  if (!options.workerFactory && typeof Worker === "undefined") {
    const { runScenarioForDiff } = await import("./scenarioDiffRunner");
    const scenarioA = findScenario(request.scenarioAId);
    const scenarioB = findScenario(request.scenarioBId);
    return {
      scenarioA: runScenarioForDiff(scenarioA, { evacuate: request.evacuate }),
      scenarioB: runScenarioForDiff(scenarioB, { evacuate: request.evacuate }),
    };
  }

  const worker = options.workerFactory?.() ?? createScenarioDiffWorker();

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
        finish(() =>
          resolve({ scenarioA: message.scenarioA, scenarioB: message.scenarioB }),
        );
        return;
      }

      finish(() => reject(new Error(message.message)));
    };
    worker.onerror = (event) => {
      finish(() => reject(new Error(event.message || "Scenario diff worker failed")));
    };
    worker.postMessage({ ...request, type: "run" });
  });
}

export function findScenario(id: string) {
  const scenario = rimeaCoreScenarios.find((candidate) => candidate.id === id);
  if (!scenario) {
    throw new Error(`Unknown scenario id: ${id}`);
  }
  return scenario;
}
