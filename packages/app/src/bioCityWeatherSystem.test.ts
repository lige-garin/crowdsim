import { describe, expect, it } from "vitest";
import { parseScene } from "@crowdsim/scene-schema";
import { bioCityDemoScene } from "./bioCityDemoScene";
import {
  createBioCityWeatherRuntimeState,
  getActiveCityEvents,
  getActiveWeatherSample,
} from "./bioCityWeatherSystem";

describe("bioCityWeatherSystem", () => {
  it("selects the active weather sample by simulation time", () => {
    expect(getActiveWeatherSample(bioCityDemoScene, 300)?.condition).toBe("rain");
    expect(getActiveWeatherSample(bioCityDemoScene, 2100)?.condition).toBe("heavyRain");
  });

  it("turns weather profile samples into environment factors", () => {
    const state = createBioCityWeatherRuntimeState(bioCityDemoScene, 2100);
    const weather = state.environmentFactors.find((factor) =>
      factor.id.startsWith("weather-profile-heavyRain"),
    );

    expect(weather).toMatchObject({
      kind: "rain",
      customParameters: {
        condition: "heavyRain",
        source: "weatherProfile",
      },
    });
    expect(weather?.routeCostMultiplier).toBeGreaterThan(1);
    expect(weather?.speedMultiplier).toBeLessThan(1);
  });

  it("activates event timeline effects and hazards by time", () => {
    const state = createBioCityWeatherRuntimeState(bioCityDemoScene, 1200);

    expect(state.activeEventIds).toEqual(
      expect.arrayContaining(["bus-delay-start", "pooling-warning"]),
    );
    expect(state.activeHazardIds).toEqual(["curbside-pooling"]);
    expect(state.environmentFactors.map((factor) => factor.id)).toEqual(
      expect.arrayContaining([
        "event-bus-delay-start",
        "event-pooling-warning",
        "hazard-curbside-pooling",
      ]),
    );
  });

  it("maps road close events into active city events", () => {
    const scene = parseScene({
      ...bioCityDemoScene,
      eventTimeline: {
        events: [
          {
            id: "close-avenue",
            kind: "roadClose",
            startsAtSeconds: 60,
            endsAtSeconds: 300,
            targetId: "rain-market-avenue",
          },
        ],
      },
    });

    expect(getActiveCityEvents(scene, 120).map((event) => event.id)).toEqual([
      "close-avenue",
    ]);
    expect(
      createBioCityWeatherRuntimeState(scene, 120).environmentFactors[1],
    ).toMatchObject({
      id: "event-close-avenue",
      kind: "exitClosed",
      targetId: "rain-market-avenue",
    });
  });
});
