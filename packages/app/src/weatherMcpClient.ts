import type { CrowdSimSceneInput } from "@crowdsim/scene-schema";

/**
 * A real, live weather fetch (ADR-0028) — Open-Meteo's public forecast API,
 * not a mock. `fetchCurrentWeather` is the "MCP-style" client this
 * project's own history described as `weather.current`; `weatherToEnvironmentFactors`
 * converts what it returns into `environmentFactorSchema` entries a scene
 * can carry. Both are pure/injectable: `fetchCurrentWeather` takes its
 * `fetch` implementation as a parameter so tests never make a real network
 * call, and `weatherToEnvironmentFactors` takes an already-fetched
 * snapshot, so the two halves — "get real data" and "turn it into this
 * project's own shape" — are independently testable.
 */

export type NormalizedWeatherSnapshot = {
  /** °C, Open-Meteo's own `temperature_2m`. */
  temperatureCelsius: number;
  /** mm in the last hour, Open-Meteo's own `precipitation`. */
  precipitationMmPerHour: number;
  /** km/h at 10 m, Open-Meteo's own `wind_speed_10m`. */
  windSpeedKmPerHour: number;
  /** The WMO weather interpretation code Open-Meteo reports alongside the
   * reading — see `weatherCodeToFactorKind` for what this project reads it
   * as. */
  weatherCode: number;
  /** The reading's own timestamp, ISO 8601, as Open-Meteo reports it. */
  observedAt: string;
};

type OpenMeteoCurrentResponse = {
  current?: {
    time?: string;
    temperature_2m?: number;
    precipitation?: number;
    wind_speed_10m?: number;
    weather_code?: number;
  };
};

const openMeteoEndpoint = "https://api.open-meteo.com/v1/forecast";

/**
 * One real fetch to Open-Meteo's current-conditions endpoint. Throws on a
 * non-OK response or a response missing a field this project reads — fail
 * loud rather than silently substituting a default reading, the same
 * standard this project's other real-world-facing modules
 * (`vehicleSimulation.ts`, `movementBackend.ts`) already hold.
 */
export async function fetchCurrentWeather(
  latitude: number,
  longitude: number,
  fetchImpl: typeof fetch = fetch,
): Promise<NormalizedWeatherSnapshot> {
  const url = `${openMeteoEndpoint}?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,precipitation,weather_code,wind_speed_10m`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(
      `weather.current request failed: ${response.status} ${response.statusText}`,
    );
  }
  const body = (await response.json()) as OpenMeteoCurrentResponse;
  const current = body.current;
  if (
    current === undefined ||
    current.temperature_2m === undefined ||
    current.precipitation === undefined ||
    current.wind_speed_10m === undefined ||
    current.weather_code === undefined ||
    current.time === undefined
  ) {
    throw new Error("weather.current response is missing an expected field");
  }
  return {
    observedAt: current.time,
    precipitationMmPerHour: current.precipitation,
    temperatureCelsius: current.temperature_2m,
    weatherCode: current.weather_code,
    windSpeedKmPerHour: current.wind_speed_10m,
  };
}

/**
 * Open-Meteo's own WMO weather interpretation codes, mapped onto this
 * project's `environmentFactorSchema` kinds — real, documented codes (fog
 * 45/48, drizzle/rain 51-67 and 80-82, snow 71-77 and 85-86, thunderstorm
 * 95-99), not a guess. Clear/mostly-clear/overcast (0-3) map to nothing:
 * fair weather is not a factor. A code this table does not recognise also
 * maps to nothing rather than guessing.
 */
export function weatherCodeToFactorKind(
  weatherCode: number,
): "fog" | "rain" | "snow" | "storm" | undefined {
  if (weatherCode === 45 || weatherCode === 48) return "fog";
  if (weatherCode >= 95) return "storm";
  if (
    (weatherCode >= 51 && weatherCode <= 67) ||
    (weatherCode >= 80 && weatherCode <= 82)
  ) {
    return "rain";
  }
  if (
    (weatherCode >= 71 && weatherCode <= 77) ||
    weatherCode === 85 ||
    weatherCode === 86
  ) {
    return "snow";
  }
  return undefined;
}

/** Precipitation intensity, mm/hour, past which severity/speedMultiplier
 * scaling reaches its maximum (a heavy-rain benchmark, not a fitted value)
 * — this project's own disclosed placeholder, the same class
 * `weatherCrowdImpact.ts`'s own coefficients already are. */
const heavyPrecipitationMmPerHour = 10;
/** °C past which a heat/cold factor is worth declaring at all. */
const heatThresholdCelsius = 35;
const coldThresholdCelsius = 0;
/** km/h past which a wind factor is worth declaring at all — a fresh-to-
 * strong breeze on the Beaufort scale, a real reference point, not fitted
 * to this project's own pedestrians. */
const windThresholdKmPerHour = 40;

function precipitationSeverity(precipitationMmPerHour: number): number {
  return Math.max(0, Math.min(1, precipitationMmPerHour / heavyPrecipitationMmPerHour));
}

export type WeatherEnvironmentFactorInput = NonNullable<
  CrowdSimSceneInput["environmentFactors"]
>[number];

/**
 * A live snapshot, converted into zero or more `environmentFactorSchema`
 * entries — precipitation (rain/snow/storm/fog by WMO code), then extreme
 * heat/cold/wind, each only when its own condition actually holds. `idPrefix`
 * lets a caller keep the ids stable across repeated fetches for the same
 * scene rather than accumulating a new entry every time (the caller's own
 * choice whether to replace or append — this function only produces the
 * candidates).
 */
export function weatherToEnvironmentFactors(
  snapshot: NormalizedWeatherSnapshot,
  idPrefix = "weather",
): WeatherEnvironmentFactorInput[] {
  const factors: WeatherEnvironmentFactorInput[] = [];

  const precipitationKind = weatherCodeToFactorKind(snapshot.weatherCode);
  if (precipitationKind !== undefined) {
    const severity = precipitationSeverity(snapshot.precipitationMmPerHour);
    factors.push({
      id: `${idPrefix}-${precipitationKind}`,
      kind: precipitationKind,
      severity,
      speedMultiplier: 1 - severity * 0.4,
      visibilityMultiplier: 1 - severity * 0.5,
    });
  }

  if (snapshot.temperatureCelsius >= heatThresholdCelsius) {
    factors.push({
      id: `${idPrefix}-heat`,
      kind: "heat",
      severity: 0.6,
      speedMultiplier: 0.85,
    });
  } else if (snapshot.temperatureCelsius <= coldThresholdCelsius) {
    factors.push({
      id: `${idPrefix}-cold`,
      kind: "cold",
      severity: 0.6,
      speedMultiplier: 0.9,
    });
  }

  if (snapshot.windSpeedKmPerHour >= windThresholdKmPerHour) {
    factors.push({
      id: `${idPrefix}-wind`,
      kind: "wind",
      severity: Math.min(1, snapshot.windSpeedKmPerHour / 80),
      speedMultiplier: 0.9,
    });
  }

  return factors;
}
