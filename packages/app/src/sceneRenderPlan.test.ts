import { describe, expect, it } from "vitest";
import { parseScene } from "@crowdsim/scene-schema";
import { defaultDemoScene } from "./defaultDemoScene";
import { createSceneRenderPlan } from "./sceneRenderPlan";

describe("sceneRenderPlan", () => {
  it("creates 3D primitives for scene roads, buildings, stops, obstacles, and hazards", () => {
    const plan = createSceneRenderPlan(defaultDemoScene, 1200);

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
          calibration: expect.objectContaining({
            simulationProxy: expect.objectContaining({
              entityId: "downtown-walkable",
              kind: "area",
            }),
            unitScaleMeters: 1,
            verified: true,
          }),
          id: "asset-rain-market-streetscape",
          kind: "gltf-scene",
          lod: "medium",
          lodSources: expect.objectContaining({
            low: "/assets/demo-scene/rain-market-streetscape.low.glb",
          }),
          sourceUrl: "/assets/demo-scene/rain-market-streetscape.glb",
        }),
        expect.objectContaining({
          id: "asset-bus-stop-shelter",
          kind: "gltf-prop",
        }),
      ]),
    );
  });

  it("exposes weather visual state for rain, fog, and wind effects", () => {
    const plan = createSceneRenderPlan(defaultDemoScene, 2100);

    expect(plan.weather.condition).toBe("heavyRain");
    expect(plan.weather.fogOpacity).toBeGreaterThan(0);
    expect(plan.weather.precipitationIntensity).toBeGreaterThan(0.5);
    expect(plan.weather.rainStreaks.length).toBeGreaterThan(12);
    expect(plan.weather.windIndicators).toHaveLength(3);
    expect(
      Math.hypot(plan.weather.windVector.x, plan.weather.windVector.y),
    ).toBeGreaterThan(0);
  });

  it("produces a crosswalk primitive from scene.crosswalks (ADR-0020, previously produced nothing at all)", () => {
    const scene = parseScene({
      ...defaultDemoScene,
      crosswalks: [
        {
          id: "crosswalk-test",
          roadId: defaultDemoScene.roads[0].id,
          position: { x: 5, y: 5 },
          widthMeters: 4,
        },
      ],
    });

    const plan = createSceneRenderPlan(scene, 0);

    expect(plan.primitives).toContainEqual(
      expect.objectContaining({
        id: "crosswalk-crosswalk-test",
        kind: "crosswalk",
        position: { x: 5, y: 5 },
        widthMeters: 4,
      }),
    );
  });

  it("marks active hazard visuals more strongly than inactive hazards", () => {
    const inactive = createSceneRenderPlan(defaultDemoScene, 300).primitives.find(
      (primitive) => primitive.id === "hazard-curbside-pooling",
    );
    const active = createSceneRenderPlan(defaultDemoScene, 1200).primitives.find(
      (primitive) => primitive.id === "hazard-curbside-pooling",
    );

    expect(active).toMatchObject({ color: "#ef4444", opacity: 0.38 });
    expect(inactive).toMatchObject({ color: "#f97316", opacity: 0.16 });
  });
});
