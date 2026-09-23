import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "./i18n";
import { ScenarioDiffPanel } from "./ScenarioDiffPanel";
import { scenarioDiffScenarioOptions } from "./scenarioDiffWorkerClient";
import type {
  ScenarioDiffWorkerLike,
  ScenarioDiffWorkerRequest,
  ScenarioDiffWorkerResponse,
} from "./scenarioDiffWorkerClient";
import type { ScenarioRunSnapshot } from "./scenarioDiffReport";

afterEach(cleanup);

function fakeSnapshot(id: string, name: string): ScenarioRunSnapshot {
  return {
    id,
    name,
    summary: {
      elapsedSeconds: 10,
      flows: [
        { backward: 1, forward: 2, id: "line-1", name: "Front door", peakPerMinute: 3 },
      ],
      journeys: { count: 4, meanSeconds: 5, p50Seconds: 5, p90Seconds: 6 },
      levelOfService: {
        current: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 },
        peakAt: null,
        peakDensity: 0.2,
        peakLevel: "A",
        shareDOrWorse: 0,
      },
      places: [],
      samples: 10,
    },
  };
}

function fakeWorker() {
  const worker: ScenarioDiffWorkerLike = {
    onerror: null,
    onmessage: null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
  };
  const reply = (response: ScenarioDiffWorkerResponse) =>
    worker.onmessage?.({ data: response } as MessageEvent<ScenarioDiffWorkerResponse>);

  return { reply, worker };
}

function renderPanel(worker: ScenarioDiffWorkerLike) {
  return render(
    <I18nProvider>
      <ScenarioDiffPanel workerFactory={() => worker} />
    </I18nProvider>,
  );
}

describe("ScenarioDiffPanel", () => {
  it("offers the built-in scenarios as scenario A and B options", () => {
    const { worker } = fakeWorker();
    renderPanel(worker);

    const selectA = screen.getByTestId("scenario-diff-a") as HTMLSelectElement;
    const optionValues = Array.from(selectA.options).map((option) => option.value);
    expect(optionValues).toEqual(
      scenarioDiffScenarioOptions.map((option) => option.id),
    );
  });

  it("runs the comparison in a worker and shows a summary once done", async () => {
    const { reply, worker } = fakeWorker();
    renderPanel(worker);

    fireEvent.click(screen.getByTestId("scenario-diff-run"));

    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "run" } as Partial<ScenarioDiffWorkerRequest>),
    );

    reply({
      scenarioA: fakeSnapshot("a-id", "Scenario Alpha"),
      scenarioB: fakeSnapshot("b-id", "Scenario Beta"),
      type: "complete",
    });

    await waitFor(() =>
      expect(screen.getByTestId("scenario-diff-summary").textContent).toContain(
        "Scenario Alpha",
      ),
    );
    expect(screen.getByTestId("scenario-diff-summary").textContent).toContain(
      "Scenario Beta",
    );
    expect(screen.getByTestId("scenario-diff-open-report")).toBeTruthy();
  });

  it("shows a worker error as an error, not a silent no-op", async () => {
    const { reply, worker } = fakeWorker();
    renderPanel(worker);

    fireEvent.click(screen.getByTestId("scenario-diff-run"));
    reply({ message: "boom", type: "error" });

    await waitFor(() =>
      expect(screen.getByTestId("scenario-diff-error").textContent).toContain("boom"),
    );
  });

  it("passes the evacuate toggle through to the worker request", () => {
    const { worker } = fakeWorker();
    renderPanel(worker);

    fireEvent.click(screen.getByTestId("scenario-diff-evacuate"));
    fireEvent.click(screen.getByTestId("scenario-diff-run"));

    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ evacuate: true }),
    );
  });
});
