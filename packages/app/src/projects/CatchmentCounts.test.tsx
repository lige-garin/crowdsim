import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { CatchmentCounts } from "./CatchmentCounts";
import { POI_LAYERS } from "./amapPoi";
import { writeAmapKey } from "./amapKey";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const place = { lat: 41.8057, lng: 123.4315, radiusMeters: 800 };

function renderPanel() {
  render(
    <I18nProvider>
      <CatchmentCounts
        lat={place.lat}
        lng={place.lng}
        radiusMeters={place.radiusMeters}
      />
    </I18nProvider>,
  );
}

function stubFetch(respond: (url: string) => unknown) {
  const fetchImpl = vi.fn(async (url: string) => ({ json: async () => respond(url) }));

  vi.stubGlobal("fetch", fetchImpl);

  return fetchImpl;
}

describe("CatchmentCounts", () => {
  it("says nothing was queried before anyone asks", () => {
    // The important one. A table of zeros here would claim the site is empty,
    // which is a different and much stronger claim than "we have not looked".
    renderPanel();

    expect(screen.getByTestId("catchment-idle")).toBeInTheDocument();
    expect(screen.queryByTestId("catchment-table")).toBeNull();
    expect(document.body.textContent).toMatch(/空的，不是零/);
  });

  it("cannot be queried without a key, and says which key is missing", () => {
    renderPanel();

    expect(screen.getByTestId("catchment-key-input")).toBeInTheDocument();
    expect(screen.getByTestId("catchment-ask")).toBeDisabled();
  });

  it("asks Amap only when pressed, because every press spends quota", async () => {
    writeAmapKey("test-key");
    const fetchImpl = stubFetch(() => ({ status: "1", count: "0", pois: [] }));

    renderPanel();
    expect(fetchImpl).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("catchment-ask"));

    await waitFor(() =>
      expect(screen.getByTestId("catchment-table")).toBeInTheDocument(),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(POI_LAYERS.length);
  });

  it("shows a zero as zero, and a refusal as a refusal", async () => {
    writeAmapKey("test-key");

    stubFetch((url) =>
      url.includes("types=150500")
        ? { status: "1", count: "0", pois: [] }
        : url.includes("types=120201")
          ? { status: "1", count: "7", pois: Array.from({ length: 7 }) }
          : { status: "0", info: "INVALID_USER_KEY" },
    );

    renderPanel();
    fireEvent.click(screen.getByTestId("catchment-ask"));

    await screen.findByTestId("catchment-table");

    // Found none is a fact.
    const subway = screen.getByTestId("catchment-row-subway");

    expect(subway.textContent).toContain("0");
    expect(subway.querySelector("[data-testid^='catchment-failed']")).toBeNull();

    const office = screen.getByTestId("catchment-row-office");

    expect(office.textContent).toContain("7");

    // Refused is not zero, and Amap's own reason is the actionable part.
    const mall = screen.getByTestId("catchment-row-mall");

    expect(screen.getByTestId("catchment-failed-mall")).toBeInTheDocument();
    expect(mall.textContent).toContain("INVALID_USER_KEY");
    expect(mall.textContent).not.toMatch(/>\s*0\s*</);
  });

  it("marks a layer that had more than one page of results", async () => {
    // Otherwise 25 reads as "there are 25" when Amap said 310.
    writeAmapKey("test-key");
    stubFetch(() => ({ status: "1", count: "310", pois: Array.from({ length: 25 }) }));

    renderPanel();
    fireEvent.click(screen.getByTestId("catchment-ask"));

    await screen.findByTestId("catchment-truncated-residential");
    expect(screen.getByTestId("catchment-row-residential").textContent).toContain("25");
  });

  it("says the counts are listings and the scenario is uncalibrated", () => {
    // The line that keeps this panel from being read as a demand model.
    renderPanel();

    expect(document.body.textContent).toMatch(/条目数/);
    expect(document.body.textContent).toMatch(/不能当客流预测/);
  });

  it("says a listing count is not de-duplicated and stops at 25", async () => {
    writeAmapKey("test-key");
    stubFetch(() => ({ status: "1", count: "3", pois: Array.from({ length: 3 }) }));

    renderPanel();
    fireEvent.click(screen.getByTestId("catchment-ask"));

    await screen.findByTestId("catchment-table");
    expect(document.body.textContent).toMatch(/没有去重/);
  });

  it("warns that a typed key is readable in this browser", () => {
    // Stated at the field, because a comment in a module is not where someone
    // deciding what to paste will look.
    renderPanel();

    const warning = document.body.textContent ?? "";

    expect(warning).toMatch(/明文/);
    expect(warning).toMatch(/referer/);
    // A server-side key is the wrong thing to paste into a browser field.
    expect(warning).toMatch(/不要用服务端 key/);
  });

  it("accepts a typed key and then allows the query", async () => {
    stubFetch(() => ({ status: "1", count: "0", pois: [] }));

    renderPanel();
    fireEvent.change(screen.getByTestId("catchment-key-input"), {
      target: { value: "typed-key" },
    });
    fireEvent.click(screen.getByTestId("catchment-key-save"));

    expect(screen.getByTestId("catchment-key-notice")).toBeInTheDocument();
    expect(screen.queryByTestId("catchment-key-input")).toBeNull();
    expect(screen.getByTestId("catchment-ask")).toBeEnabled();
    expect(screen.getByTestId("catchment-key-state").textContent).toMatch(/你输入的/);
  });

  it("does not paint a saved key in the refusal style", () => {
    stubFetch(() => ({ status: "1", count: "0", pois: [] }));

    renderPanel();
    fireEvent.change(screen.getByTestId("catchment-key-input"), {
      target: { value: "typed-key" },
    });
    fireEvent.click(screen.getByTestId("catchment-key-save"));

    // `storage-error` is red everywhere else on this form and means one thing
    // there: the write was refused. A success wearing it is a false alarm.
    expect(screen.getByTestId("catchment-key-notice").className).not.toContain(
      "storage-error",
    );
  });

  it("reports a refused key write instead of pretending it saved", () => {
    const original = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === "crowdsim.amapKey.v1") {
        throw new DOMException("quota", "QuotaExceededError");
      }

      return original.call(this, key, value);
    });

    renderPanel();
    fireEvent.change(screen.getByTestId("catchment-key-input"), {
      target: { value: "typed-key" },
    });
    fireEvent.click(screen.getByTestId("catchment-key-save"));

    expect(screen.getByTestId("catchment-key-notice").textContent).toMatch(/隐私模式/);

    // Restored here rather than in `afterEach`: `vi.unstubAllGlobals` does not
    // undo a `spyOn`, and a spy left in place makes every later write to this
    // key throw — which fails the next test for a reason that has nothing to do
    // with it. That is exactly how this test went green alone and red in a run.
    setItem.mockRestore();
  });

  it("shows the radius it is counting within, because the number needs a scale", () => {
    renderPanel();

    expect(document.body.textContent).toContain("800 m");
  });

  it("reports a request that failed outright rather than showing nothing", async () => {
    writeAmapKey("test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    renderPanel();
    fireEvent.click(screen.getByTestId("catchment-ask"));

    // The layer-level handler turns this into seven failed rows rather than a
    // thrown error, so the panel must show the table with the reasons on it.
    // One layer per request, sequentially, so this is seven awaits rather than
    // one — the wait has to be for the last of them.
    await waitFor(
      () =>
        expect(screen.getByTestId("catchment-failed-residential")).toBeInTheDocument(),
      { timeout: 4000 },
    );
    expect(screen.getByTestId("catchment-table")).toBeInTheDocument();
    expect(screen.getByTestId("catchment-failed-office")).toBeInTheDocument();
  });
});
