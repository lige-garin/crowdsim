import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WeatherPanel } from "./WeatherPanel";
import { defaultDemoScene } from "../scenes/defaultDemoScene";
import { I18nProvider } from "../i18n";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

/** Same shape `weatherMcpClient.test.ts` already uses for a real-shaped
 * Open-Meteo response, driven by hand rather than a real network call. */
function fakeFetch(body: unknown, ok = true, status = 200) {
  return (async () =>
    ({
      json: async () => body,
      ok,
      status,
      statusText: ok ? "OK" : "Error",
    }) as Response) as typeof fetch;
}

const rainyResponse = {
  current: {
    precipitation: 3.5,
    temperature_2m: 12.0,
    time: "2026-09-25T00:00",
    weather_code: 63,
    wind_speed_10m: 10.0,
  },
};

const clearResponse = {
  current: {
    precipitation: 0,
    temperature_2m: 20.0,
    time: "2026-09-25T00:00",
    weather_code: 1,
    wind_speed_10m: 5.0,
  },
};

function renderPanel(
  fetchImpl: typeof fetch,
  onApplyScene?: (scene: typeof defaultDemoScene) => void,
) {
  return render(
    <I18nProvider>
      <WeatherPanel
        scene={defaultDemoScene}
        onApplyScene={onApplyScene}
        fetchImpl={fetchImpl}
      />
    </I18nProvider>,
  );
}

describe("WeatherPanel", () => {
  it("does nothing until asked", () => {
    renderPanel(fakeFetch(rainyResponse));
    expect(screen.queryByTestId("weather-snapshot")).toBeNull();
  });

  it("fetches on demand and shows the derived factor", async () => {
    renderPanel(fakeFetch(rainyResponse));
    fireEvent.click(screen.getByTestId("weather-fetch"));

    await waitFor(() => expect(screen.getByTestId("weather-snapshot")).toBeTruthy());
    expect(screen.getByTestId("weather-snapshot").textContent).toContain("12.0");
    expect(screen.getByTestId("weather-factor-rain")).toBeTruthy();
  });

  it("says explicitly when the weather crosses no factor threshold", async () => {
    renderPanel(fakeFetch(clearResponse), () => undefined);
    fireEvent.click(screen.getByTestId("weather-fetch"));

    await waitFor(() => expect(screen.getByTestId("weather-no-factors")).toBeTruthy());
    // Still offered — applying an empty list is how a scene's weather gets
    // cleared once it turns fair again.
    expect(screen.queryByTestId("weather-apply")).toBeTruthy();
  });

  it("applies the fetched factors to the scene on request, not automatically", async () => {
    let applied: unknown;
    renderPanel(fakeFetch(rainyResponse), (scene) => {
      applied = scene;
    });
    fireEvent.click(screen.getByTestId("weather-fetch"));
    await waitFor(() => expect(screen.getByTestId("weather-apply")).toBeTruthy());

    expect(applied).toBeUndefined();

    fireEvent.click(screen.getByTestId("weather-apply"));

    await waitFor(() => expect(screen.getByTestId("weather-applied")).toBeTruthy());
    expect(applied).toBeDefined();
    const appliedScene = applied as typeof defaultDemoScene;
    expect(appliedScene.environmentFactors.some((f) => f.id === "weather-rain")).toBe(
      true,
    );
  });

  it("hides the apply button when no onApplyScene is wired in", async () => {
    renderPanel(fakeFetch(rainyResponse), undefined);
    fireEvent.click(screen.getByTestId("weather-fetch"));

    await waitFor(() => expect(screen.getByTestId("weather-snapshot")).toBeTruthy());
    expect(screen.queryByTestId("weather-apply")).toBeNull();
  });

  it("says what went wrong instead of showing nothing", async () => {
    renderPanel(fakeFetch({}, false, 500));
    fireEvent.click(screen.getByTestId("weather-fetch"));

    await waitFor(() => expect(screen.getByTestId("weather-error")).toBeTruthy());
    expect(screen.getByTestId("weather-error").textContent).toContain("500");
  });
});
