import { describe, expect, it } from "vitest";
import { bioCityDemoScene } from "./bioCityDemoScene";
import { createBioCityRenderPlan } from "./bioCityRenderPlan";

describe("bioCityRenderPlan", () => {
  it("creates 3D primitives for BioCity roads, buildings, stops, obstacles, and hazards", () => {
    const plan = createBioCityRenderPlan(bioCityDemoScene, 1200);

    expect(plan.primitives.map((primitive) => primitive.kind)).toEqual(
      expect.arrayContaining(["road", "building", "transitStop", "obstacle", "hazard"]),
    );
    expect(
      plan.primitives.find((primitive) => primitive.id === "building-glass-arcade"),
    ).toMatchObject({
      heightMeters: 18,
      kind: "building",
    });
    expect(plan.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "asset-rain-market-streetscape",
          kind: "gltf-scene",
          sourceUrl: "/assets/biocity/rain-market-streetscape.glb",
        }),
        expect.objectContaining({
          id: "asset-bus-stop-shelter",
          kind: "gltf-prop",
        }),
      ]),
    );
  });

  it("exposes weather visual state for rain, fog, and wind effects", () => {
    const plan = createBioCityRenderPlan(bioCityDemoScene, 2100);

    expect(plan.weather.condition).toBe("heavyRain");
    expect(plan.weather.fogOpacity).toBeGreaterThan(0);
    expect(plan.weather.precipitationIntensity).toBeGreaterThan(0.5);
    expect(plan.weather.rainStreaks.length).toBeGreaterThan(12);
    expect(plan.weather.windIndicators).toHaveLength(3);
    expect(
      Math.hypot(plan.weather.windVector.x, plan.weather.windVector.y),
    ).toBeGreaterThan(0);
  });

  it("marks active hazard visuals more strongly than inactive hazards", () => {
    const inactive = createBioCityRenderPlan(bioCityDemoScene, 300).primitives.find(
      (primitive) => primitive.id === "hazard-curbside-pooling",
    );
    const active = createBioCityRenderPlan(bioCityDemoScene, 1200).primitives.find(
      (primitive) => primitive.id === "hazard-curbside-pooling",
    );

    expect(active).toMatchObject({ color: "#ef4444", opacity: 0.38 });
    expect(inactive).toMatchObject({ color: "#f97316", opacity: 0.16 });
  });
});
