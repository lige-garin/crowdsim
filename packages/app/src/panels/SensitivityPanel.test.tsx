import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SensitivityPanel } from "./SensitivityPanel";
import type {
  ExperimentWorkerLike,
  ExperimentWorkerRequest,
  ExperimentWorkerResponse,
} from "../analytics/experimentWorkerClient";
import { I18nProvider } from "../i18n";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

/** Same hand-driven fake worker `ExperimentSweepPanel.test.tsx` uses. */
function fakeWorker() {
  const posted: ExperimentWorkerRequest[] = [];
  const worker: ExperimentWorkerLike = {
    onerror: null,
    onmessage: null,
    postMessage: (message) => posted.push(message),
    terminate: vi.fn(),
  };
  const reply = (response: ExperimentWorkerResponse) =>
    worker.onmessage?.({ data: response } as MessageEvent<ExperimentWorkerResponse>);

  return { posted, reply, worker };
}

function result(variantId: string, throughputPerMinute: number) {
  return {
    benchmark: { exitedCount: 3, throughputPerMinute },
    variantId,
  } as never;
}

function renderPanel(worker: ExperimentWorkerLike) {
  return render(
    <I18nProvider>
      <SensitivityPanel workerFactory={() => worker} />
    </I18nProvider>,
  );
}

describe("SensitivityPanel: Morris screening", () => {
  it("sends a Morris experiment to a worker — 6 trajectories x 7 points", () => {
    const { posted, worker } = fakeWorker();
    renderPanel(worker);

    fireEvent.click(screen.getByTestId("sensitivity-run"));

    expect(posted).toHaveLength(1);
    const request = posted[0];
    expect(request.type).toBe("run-experiment");
    if (request.type !== "run-experiment") throw new Error("unreachable");
    expect(request.experiment.variants).toHaveLength(42);
  });
});

describe("SensitivityPanel: Sobol variance decomposition", () => {
  it("sends a separate Sobol experiment to a worker — 8 samples x (6 parameters + 2)", () => {
    const { posted, worker } = fakeWorker();
    renderPanel(worker);

    fireEvent.click(screen.getByTestId("sobol-run"));

    expect(posted).toHaveLength(1);
    const request = posted[0];
    expect(request.type).toBe("run-experiment");
    if (request.type !== "run-experiment") throw new Error("unreachable");
    expect(request.experiment.variants).toHaveLength(64);
  });

  it("shows progress and can be stopped, independently of the Morris run", async () => {
    const { posted, reply, worker } = fakeWorker();
    renderPanel(worker);
    fireEvent.click(screen.getByTestId("sobol-run"));
    reply({ progress: { completed: 10, total: 64 }, type: "progress" });

    await waitFor(() =>
      expect(screen.getByTestId("sobol-progress").textContent).toContain("10/64"),
    );
    // The Morris side never ran, so it has nothing to show.
    expect(screen.queryByTestId("sensitivity-progress")).toBeNull();

    fireEvent.click(screen.getByTestId("sobol-stop"));
    expect(posted.at(-1)).toEqual({ type: "abort" });
    await waitFor(() => expect(screen.getByTestId("sobol-error")).toBeTruthy());
  });

  it("renders both Sobol charts and the ranked S_i/S_Ti list once done", async () => {
    const { reply, worker } = fakeWorker();
    renderPanel(worker);
    fireEvent.click(screen.getByTestId("sobol-run"));

    // One deterministic result per variant id keeps the reconstructed
    // indices well-defined without depending on real sample randomness.
    const variantIds = [
      ...Array.from({ length: 8 }, (_, i) => `a-${i}`),
      ...Array.from({ length: 8 }, (_, i) => `b-${i}`),
      ...Array.from({ length: 6 }, (_, param) =>
        Array.from({ length: 8 }, (_, i) => `ab${param}-${i}`),
      ).flat(),
    ];
    reply({
      results: variantIds.map((id, index) => result(id, 10 + (index % 5))),
      type: "complete",
    });

    await waitFor(() => expect(screen.getByTestId("sobol-rank-0")).toBeTruthy());
    expect(screen.getByTestId("sobol-rank-0").textContent).toContain("S");
    expect(
      screen.getByRole("img", {
        name: /First-order Sobol ranking|一阶 Sobol 指数排名/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: /First\/total-order Sobol scatter|一阶\/总阶 Sobol 指数散点/,
      }),
    ).toBeInTheDocument();
  });

  it("says what went wrong instead of showing nothing", async () => {
    const { reply, worker } = fakeWorker();
    renderPanel(worker);
    fireEvent.click(screen.getByTestId("sobol-run"));
    reply({ message: "worker exploded", type: "error" });

    await waitFor(() =>
      expect(screen.getByTestId("sobol-error").textContent).toContain(
        "worker exploded",
      ),
    );
  });
});
