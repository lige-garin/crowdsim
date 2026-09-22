import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExperimentSweepPanel } from "./ExperimentSweepPanel";
import type {
  ExperimentWorkerLike,
  ExperimentWorkerRequest,
  ExperimentWorkerResponse,
} from "./experimentWorkerClient";
import { I18nProvider } from "./i18n";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

/**
 * A worker the test drives by hand. The panel used to print the worker request
 * it never sent; these cases exist to pin that it really posts one and really
 * waits for the answer.
 */
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
      <ExperimentSweepPanel workerFactory={() => worker} />
    </I18nProvider>,
  );
}

describe("ExperimentSweepPanel", () => {
  it("sends the sweep to a worker rather than running it on this thread", () => {
    const { posted, worker } = fakeWorker();
    renderPanel(worker);

    // Nothing runs until asked: opening the panel no longer freezes the app.
    expect(posted).toHaveLength(0);

    fireEvent.click(screen.getByTestId("sweep-run"));

    expect(posted).toHaveLength(1);
    const request = posted[0];

    expect(request.type).toBe("run-experiment");
    if (request.type !== "run-experiment") throw new Error("unreachable");
    expect(request.mode).toBe("headless-no-render");
    // Three exit widths, five runs each.
    expect(request.experiment.variants).toHaveLength(3);
    expect(request.totalJobs).toBe(15);
  });

  it("shows how far it has got, and can be stopped", async () => {
    const { posted, reply, worker } = fakeWorker();
    renderPanel(worker);
    fireEvent.click(screen.getByTestId("sweep-run"));
    reply({ progress: { completed: 4, total: 15 }, type: "progress" });

    await waitFor(() =>
      expect(screen.getByTestId("sweep-progress").textContent).toContain("4/15"),
    );

    fireEvent.click(screen.getByTestId("sweep-stop"));

    expect(posted.at(-1)).toEqual({ type: "abort" });
    await waitFor(() => expect(screen.getByTestId("sweep-error")).toBeTruthy());
  });

  it("reports each variant with an interval and the runs behind it", async () => {
    const { reply, worker } = fakeWorker();
    renderPanel(worker);
    fireEvent.click(screen.getByTestId("sweep-run"));
    reply({
      results: [
        result("wide", 30),
        result("wide", 34),
        result("wide", 32),
        result("narrow", 12),
      ],
      type: "complete",
    });

    await waitFor(() => expect(screen.getByTestId("sweep-result-wide")).toBeTruthy());

    expect(screen.getByTestId("sweep-result-wide").textContent).toMatch(/95%/);
    expect(screen.getByTestId("sweep-result-wide").textContent).toContain("3 次");
    // One run is one run: a number with no interval, and it says so.
    expect(screen.getByTestId("sweep-result-narrow").textContent).toContain("无区间");
    expect(screen.getByTestId("sweep-result-narrow").textContent).not.toMatch(/95%/);
  });

  it("says what went wrong instead of showing nothing", async () => {
    const { reply, worker } = fakeWorker();
    renderPanel(worker);
    fireEvent.click(screen.getByTestId("sweep-run"));
    reply({ message: "worker exploded", type: "error" });

    await waitFor(() =>
      expect(screen.getByTestId("sweep-error").textContent).toContain(
        "worker exploded",
      ),
    );
  });
});
