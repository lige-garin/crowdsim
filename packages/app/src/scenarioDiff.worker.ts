import { runScenarioForDiff } from "./scenarioDiffRunner";
import { findScenario } from "./scenarioDiffWorkerClient";
import type {
  ScenarioDiffWorkerRequest,
  ScenarioDiffWorkerResponse,
} from "./scenarioDiffWorkerClient";

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<ScenarioDiffWorkerRequest>) => void) | null;
  postMessage: (message: ScenarioDiffWorkerResponse) => void;
};

workerScope.onmessage = (event) => {
  try {
    const { evacuate, scenarioAId, scenarioBId } = event.data;
    const scenarioA = runScenarioForDiff(findScenario(scenarioAId), { evacuate });
    const scenarioB = runScenarioForDiff(findScenario(scenarioBId), { evacuate });
    workerScope.postMessage({ scenarioA, scenarioB, type: "complete" });
  } catch (error) {
    workerScope.postMessage({
      message: error instanceof Error ? error.message : "Scenario diff run failed",
      type: "error",
    });
  }
};
