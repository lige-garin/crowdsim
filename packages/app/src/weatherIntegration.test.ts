import { describe, expect, it } from "vitest";
import { parseScene } from "@crowdsim/scene-schema";
import {
  applyWeatherSnapshotToScene,
  createEnvironmentFactorsFromWeatherSnapshot,
  createWeatherMcpRequest,
} from "./weatherIntegration";

const scene = parseScene({
  schemaVersion: "1.0.0",
  id: "weather-demo",
  name: "Weather Demo",
  world: { width: 40, height: 20 },
});

describe("weather integration", () => {
  it("creates a stable MCP request contract for real weather providers", () => {
    expect(createWeatherMcpRequest({ latitude: 31.23, longitude: 121.47 })).toEqual({
      arguments: {
        latitude: 31.23,
        longitude: 121.47,
        units: "metric",
      },
      toolName: "weather.current",
    });
  });

  it("maps a real-weather snapshot into environment factors", () => {
    const factors = createEnvironmentFactorsFromWeatherSnapshot({
      condition: "fog",
      fetchedAtIso: "2026-06-14T09:00:00.000Z",
      location: { latitude: 31.23, longitude: 121.47, name: "Shanghai" },
      visibilityMeters: 220,
    });

    expect(factors[0]).toMatchObject({
      id: "weather-fog",
      kind: "fog",
      visibilityMultiplier: expect.any(Number),
    });
    expect(
      "visibilityMultiplier" in factors[0] ? factors[0].visibilityMultiplier : 1,
    ).toBeLessThan(0.5);
  });

  it("applies weather to a scene without duplicating previous weather factors", () => {
    const rainy = applyWeatherSnapshotToScene(scene, {
      condition: "rain",
      fetchedAtIso: "2026-06-14T09:00:00.000Z",
      location: { latitude: 31.23, longitude: 121.47 },
      precipitationMmPerHour: 8,
    });
    const storm = applyWeatherSnapshotToScene(rainy, {
      condition: "storm",
      fetchedAtIso: "2026-06-14T10:00:00.000Z",
      location: { latitude: 31.23, longitude: 121.47 },
      precipitationMmPerHour: 16,
      windMetersPerSecond: 20,
    });

    expect(rainy.environmentFactors.map((factor) => factor.id)).toEqual([
      "weather-rain",
    ]);
    expect(storm.environmentFactors.map((factor) => factor.id)).toEqual([
      "weather-storm",
    ]);
    expect(storm.environmentFactors[0].customParameters.provider).toBe("mcp-weather");
  });
});
