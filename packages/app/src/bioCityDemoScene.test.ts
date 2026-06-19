import { parseScene } from "@crowdsim/scene-schema";
import { describe, expect, it } from "vitest";
import { bioCityDemoScene } from "./bioCityDemoScene";

describe("bioCityDemoScene", () => {
  it("round-trips through JSON and keeps BioCity collections", () => {
    const roundTripped = parseScene(JSON.parse(JSON.stringify(bioCityDemoScene)));

    expect(roundTripped.roads.map((road) => road.id)).toEqual([
      "rain-market-avenue",
      "bus-loop",
    ]);
    expect(roundTripped.buildings.map((building) => building.id)).toEqual([
      "glass-arcade",
      "food-hall-south",
    ]);
    expect(roundTripped.visualAssets.map((asset) => asset.id)).toEqual([
      "rain-market-streetscape",
      "bus-stop-shelter",
    ]);
    expect(roundTripped.visualAssets[0]).toMatchObject({
      calibration: {
        accuracyMeters: 0.5,
        origin: "scene-anchor",
        simulationProxy: {
          entityId: "downtown-walkable",
          kind: "area",
          role: "alignment-only",
        },
        unitScaleMeters: 1,
        upAxis: "y-up",
        verified: true,
      },
      collisionMode: "none",
      lodSources: {
        high: "/assets/biocity/rain-market-streetscape.high.glb",
        low: "/assets/biocity/rain-market-streetscape.low.glb",
        medium: "/assets/biocity/rain-market-streetscape.glb",
      },
      originalSourceFormat: "sketchup",
      sourceUrl: "/assets/biocity/rain-market-streetscape.glb",
    });
    expect(roundTripped.transitStops[0]).toMatchObject({
      id: "rain-market-bus-stop",
      roadId: "bus-loop",
      kind: "bus",
      delayFactor: 1.25,
    });
    expect(roundTripped.weatherProfile.source).toBe("manual");
    expect(
      roundTripped.weatherProfile.samples.map((sample) => sample.condition),
    ).toEqual(["rain", "heavyRain"]);
    expect(roundTripped.hazards[0]).toMatchObject({
      id: "curbside-pooling",
      affectedRoadId: "rain-market-avenue",
      speedMultiplier: 0.76,
    });
    expect(roundTripped.bioAgentProfiles.map((profile) => profile.id)).toEqual([
      "commuter-rain-sensitive",
      "shopper-shelter-seeker",
    ]);
  });
});
