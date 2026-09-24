import { describe, expect, it } from "vitest";
import {
  fetchCurrentWeather,
  weatherCodeToFactorKind,
  weatherToEnvironmentFactors,
  type NormalizedWeatherSnapshot,
} from "./weatherMcpClient";

function fakeFetch(body: unknown, ok = true, status = 200) {
  let calledUrl: string | undefined;
  const impl = (async (url: string) => {
    calledUrl = url;
    return {
      json: async () => body,
      ok,
      status,
      statusText: ok ? "OK" : "Error",
    } as Response;
  }) as typeof fetch;
  return { getCalledUrl: () => calledUrl, impl };
}

describe("fetchCurrentWeather", () => {
  it("parses a real-shaped Open-Meteo current-conditions response", async () => {
    const { impl } = fakeFetch({
      current: {
        precipitation: 2.5,
        temperature_2m: 18.2,
        time: "2026-09-24T12:00",
        weather_code: 61,
        wind_speed_10m: 14.3,
      },
    });
    const snapshot = await fetchCurrentWeather(35.68, 139.77, impl);
    expect(snapshot).toEqual<NormalizedWeatherSnapshot>({
      observedAt: "2026-09-24T12:00",
      precipitationMmPerHour: 2.5,
      temperatureCelsius: 18.2,
      weatherCode: 61,
      windSpeedKmPerHour: 14.3,
    });
  });

  it("calls the real Open-Meteo endpoint with the requested coordinates", async () => {
    const { getCalledUrl, impl } = fakeFetch({
      current: {
        precipitation: 0,
        temperature_2m: 20,
        time: "t",
        weather_code: 0,
        wind_speed_10m: 5,
      },
    });
    await fetchCurrentWeather(35.68, 139.77, impl);
    const url = getCalledUrl()!;
    expect(url).toContain("api.open-meteo.com/v1/forecast");
    expect(url).toContain("latitude=35.68");
    expect(url).toContain("longitude=139.77");
  });

  it("throws rather than silently substituting a default reading on a non-OK response", async () => {
    const { impl } = fakeFetch({}, false, 503);
    await expect(fetchCurrentWeather(0, 0, impl)).rejects.toThrow(/503/);
  });

  it("throws rather than silently substituting a default reading when a field is missing", async () => {
    const { impl } = fakeFetch({
      current: { precipitation: 0, temperature_2m: 20, weather_code: 0 },
    });
    await expect(fetchCurrentWeather(0, 0, impl)).rejects.toThrow(/missing/);
  });
});

describe("weatherCodeToFactorKind", () => {
  it("maps real WMO codes to this project's own factor kinds", () => {
    expect(weatherCodeToFactorKind(45)).toBe("fog");
    expect(weatherCodeToFactorKind(48)).toBe("fog");
    expect(weatherCodeToFactorKind(61)).toBe("rain");
    expect(weatherCodeToFactorKind(82)).toBe("rain");
    expect(weatherCodeToFactorKind(73)).toBe("snow");
    expect(weatherCodeToFactorKind(86)).toBe("snow");
    expect(weatherCodeToFactorKind(95)).toBe("storm");
    expect(weatherCodeToFactorKind(99)).toBe("storm");
  });

  it("maps clear/cloudy codes to no factor at all", () => {
    expect(weatherCodeToFactorKind(0)).toBeUndefined();
    expect(weatherCodeToFactorKind(1)).toBeUndefined();
    expect(weatherCodeToFactorKind(3)).toBeUndefined();
  });
});

describe("weatherToEnvironmentFactors", () => {
  const clear: NormalizedWeatherSnapshot = {
    observedAt: "t",
    precipitationMmPerHour: 0,
    temperatureCelsius: 20,
    weatherCode: 0,
    windSpeedKmPerHour: 10,
  };

  it("produces no factors for fair weather", () => {
    expect(weatherToEnvironmentFactors(clear)).toEqual([]);
  });

  it("produces a rain factor scaled by precipitation intensity", () => {
    const light = weatherToEnvironmentFactors({
      ...clear,
      precipitationMmPerHour: 1,
      weatherCode: 61,
    });
    const heavy = weatherToEnvironmentFactors({
      ...clear,
      precipitationMmPerHour: 15,
      weatherCode: 65,
    });
    expect(light[0].kind).toBe("rain");
    expect(heavy[0].kind).toBe("rain");
    // Heavier rain must read as more severe and slow people down more.
    expect(heavy[0].severity!).toBeGreaterThan(light[0].severity!);
    expect(heavy[0].speedMultiplier!).toBeLessThan(light[0].speedMultiplier!);
    // Heavy rain is clamped at the maximum, not scaled past it.
    expect(heavy[0].severity).toBe(1);
  });

  it("produces a snow factor for a snow code", () => {
    const factors = weatherToEnvironmentFactors({
      ...clear,
      precipitationMmPerHour: 3,
      weatherCode: 73,
    });
    expect(factors[0].kind).toBe("snow");
  });

  it("produces a heat factor only past the extreme-heat threshold", () => {
    expect(weatherToEnvironmentFactors({ ...clear, temperatureCelsius: 30 })).toEqual(
      [],
    );
    const factors = weatherToEnvironmentFactors({ ...clear, temperatureCelsius: 38 });
    expect(factors).toHaveLength(1);
    expect(factors[0].kind).toBe("heat");
  });

  it("produces a cold factor only past the extreme-cold threshold", () => {
    expect(weatherToEnvironmentFactors({ ...clear, temperatureCelsius: 5 })).toEqual(
      [],
    );
    const factors = weatherToEnvironmentFactors({ ...clear, temperatureCelsius: -3 });
    expect(factors).toHaveLength(1);
    expect(factors[0].kind).toBe("cold");
  });

  it("produces a wind factor only past the strong-wind threshold", () => {
    expect(weatherToEnvironmentFactors({ ...clear, windSpeedKmPerHour: 20 })).toEqual(
      [],
    );
    const factors = weatherToEnvironmentFactors({ ...clear, windSpeedKmPerHour: 55 });
    expect(factors).toHaveLength(1);
    expect(factors[0].kind).toBe("wind");
  });

  it("can produce multiple factors at once (rain and strong wind together)", () => {
    const factors = weatherToEnvironmentFactors({
      ...clear,
      precipitationMmPerHour: 8,
      weatherCode: 63,
      windSpeedKmPerHour: 60,
    });
    expect(factors.map((f) => f.kind).sort()).toEqual(["rain", "wind"]);
  });

  it("keeps ids stable across repeated conversions with the same prefix, for a caller to replace by id", () => {
    const first = weatherToEnvironmentFactors(
      { ...clear, precipitationMmPerHour: 2, weatherCode: 61 },
      "scene-weather",
    );
    const second = weatherToEnvironmentFactors(
      { ...clear, precipitationMmPerHour: 9, weatherCode: 65 },
      "scene-weather",
    );
    expect(first[0].id).toBe(second[0].id);
  });
});
