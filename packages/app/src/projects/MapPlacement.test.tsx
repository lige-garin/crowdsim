import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { MapPlacement } from "./MapPlacement";

afterEach(() => {
  cleanup();
  delete (globalThis as { AMap?: unknown }).AMap;
  vi.unstubAllEnvs();
});

function renderPlacement(
  onNext: (point: { lat: number; lng: number }, radius: number) => void = () => {},
) {
  render(
    <I18nProvider>
      <MapPlacement onCancel={() => {}} onNext={onNext} />
    </I18nProvider>,
  );
}

describe("MapPlacement", () => {
  it("works with no map key, because the coordinates are what a project needs", () => {
    renderPlacement();

    // No key is configured in tests, so this is the state a fresh build is in.
    // The flow must not dead-end here.
    expect(screen.getByTestId("map-nokey")).toBeInTheDocument();
    expect(screen.queryByTestId("map-canvas")).toBeNull();
    expect(screen.getByTestId("map-lat")).toBeEnabled();
    expect(screen.getByTestId("map-lng")).toBeEnabled();
  });

  it("defaults somewhere recognisable rather than to 0,0", () => {
    renderPlacement();

    // 0,0 is the Gulf of Guinea. A default there is the classic silent bug of
    // a map that loads fine and points at open water.
    const lat = Number((screen.getByTestId("map-lat") as HTMLInputElement).value);
    const lng = Number((screen.getByTestId("map-lng") as HTMLInputElement).value);

    expect(lat).toBeGreaterThan(41);
    expect(lat).toBeLessThan(42);
    expect(lng).toBeGreaterThan(123);
    expect(lng).toBeLessThan(124);
  });

  it("hands on the coordinates that were typed", () => {
    const next: { point: { lat: number; lng: number }; radius: number }[] = [];

    renderPlacement((point, radius) => {
      next.push({ point, radius });
    });

    fireEvent.change(screen.getByTestId("map-lat"), { target: { value: "41.12345" } });
    fireEvent.change(screen.getByTestId("map-lng"), { target: { value: "123.98765" } });
    fireEvent.change(screen.getByTestId("map-radius"), { target: { value: "1200" } });
    fireEvent.click(screen.getByTestId("map-next"));

    expect(next).toEqual([{ point: { lat: 41.12345, lng: 123.98765 }, radius: 1200 }]);
  });

  it("can be backed out of", () => {
    let cancelled = false;

    render(
      <I18nProvider>
        <MapPlacement
          onCancel={() => {
            cancelled = true;
          }}
          onNext={() => {}}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByTestId("map-cancel"));

    expect(cancelled).toBe(true);
  });

  it("says the radius is a catchment, not the size of the site", () => {
    renderPlacement();

    // The two numbers look alike and mean completely different things: one is
    // how far out to count people, the other is the building.
    expect(screen.getByTestId("map-radius")).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/半径/);
    expect(document.body.textContent).toMatch(/不是场地大小/);
  });

  it("names the coordinate system, because 570 m in Shenyang is not a rounding error", () => {
    renderPlacement();

    expect(document.body.textContent).toContain("GCJ-02");
  });

  it("destroys the map on the way out, because a leaked one keeps its listeners", async () => {
    // A cleanup written as a `return` inside a `.then` callback is the
    // promise's value, not something React calls, so the map survives every
    // back-and-forth through the wizard. It has to be the effect's own return.
    const destroy = vi.fn();
    const on = vi.fn();
    const add = vi.fn();

    (globalThis as { AMap?: unknown }).AMap = {
      Circle: class {
        setCenter() {}
        setRadius() {}
      },
      Map: class {
        add = add;
        destroy = destroy;
        on = on;
      },
      Marker: class {
        on = on;
        setPosition() {}
      },
    };
    vi.stubEnv("VITE_AMAP_KEY", "test-key");

    const { unmount } = render(
      <I18nProvider>
        <MapPlacement onCancel={() => {}} onNext={() => {}} />
      </I18nProvider>,
    );

    // The SDK resolves through a promise even when `AMap` is already there, so
    // the constructor runs on a microtask rather than during render. Wait for
    // the map to actually exist before unmounting: asserting straight after the
    // render would pass just as well with the cleanup missing, because
    // "not called yet" and "never called" look identical from here.
    await vi.waitFor(() => {
      expect(on).toHaveBeenCalled();
    });

    unmount();

    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
