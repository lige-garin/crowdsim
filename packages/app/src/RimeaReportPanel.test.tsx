import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "./i18n";
import { RimeaReportPanel } from "./RimeaReportPanel";
import type { RimeaTestResult } from "./rimeaSuite";
import type { RimeaWorkerLike, RimeaWorkerResponse } from "./rimeaWorkerClient";

afterEach(cleanup);

function fakeWorker() {
  const worker: RimeaWorkerLike = {
    onerror: null,
    onmessage: null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
  };
  const reply = (response: RimeaWorkerResponse) =>
    worker.onmessage?.({ data: response } as MessageEvent<RimeaWorkerResponse>);

  return { reply, worker };
}

function renderPanel(worker: RimeaWorkerLike) {
  return render(
    <I18nProvider>
      <RimeaReportPanel workerFactory={() => worker} />
    </I18nProvider>,
  );
}

describe("RimeaReportPanel", () => {
  it("lists all sixteen tests before anything is run", () => {
    const { worker } = fakeWorker();
    renderPanel(worker);

    // The three that are built are filled in by a run; the rest are listed
    // from the start so the panel is never blank.
    for (let number = 1; number <= 16; number += 1) {
      if (number === 1 || number === 4 || number === 6) continue;
      expect(screen.getByTestId(`rimea-test-${number}`)).toBeTruthy();
    }

    expect(screen.getByTestId("rimea-summary").textContent).toContain("未实现 13");
  });

  it("names the clause each unbuilt test comes from", () => {
    const { worker } = fakeWorker();
    renderPanel(worker);

    // The guideline's own subjects, not the ones this file used to guess from
    // memory: 13 is the fundamental diagram on stairs, 14 is choice of route,
    // and there is no smoke or lift test in it at all.
    expect(screen.getByTestId("rimea-test-13").textContent).toContain("p. 42");
    expect(screen.getByTestId("rimea-test-14").textContent).toContain("p. 44");
    expect(screen.getByTestId("rimea-test-2").textContent).toContain("p. 29");
  });

  it("runs the suite in a worker and shows a failure as a failure", async () => {
    const { reply, worker } = fakeWorker();
    renderPanel(worker);

    fireEvent.click(screen.getByTestId("rimea-run"));
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "run" });

    const failing: RimeaTestResult = {
      criterion: "within 0.1 m/s of Weidmann; tolerance is self-authored",
      measured: "worst deviation 0.148 m/s at 0.5 P/m²",
      number: 4,
      status: "fail",
      title: "Fundamental diagram: speed against density",
    };

    reply({ results: [failing], type: "complete" });

    await waitFor(() =>
      expect(screen.getByTestId("rimea-test-4").textContent).toContain("未通过"),
    );
    expect(screen.getByTestId("rimea-test-4").textContent).toContain("0.148");
    expect(screen.getByTestId("rimea-summary").textContent).toContain("未通过 1");
  });
});
