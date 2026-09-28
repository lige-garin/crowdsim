import { describe, expect, it } from "vitest";
import { parseScene } from "@crowdsim/scene-schema";
import { defaultDemoScene } from "../scenes/defaultDemoScene";
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

    // `rain-market-avenue` (roads[0]) is a straight east-west line, so this
    // is heading 0 regardless of how far `position` sits from it — see the
    // dedicated heading/road-width tests below for the parts this one
    // doesn't exercise.
    expect(plan.primitives).toContainEqual(
      expect.objectContaining({
        headingRadians: 0,
        id: "crosswalk-crosswalk-test",
        kind: "crosswalk",
        position: { x: 5, y: 5 },
        roadWidthMeters: defaultDemoScene.roads[0].widthMeters,
        widthMeters: 4,
      }),
    );
  });

  it("orients a crosswalk to its own road's heading at that point, not a fixed direction", () => {
    const scene = parseScene({
      ...defaultDemoScene,
      roads: [
        ...defaultDemoScene.roads,
        {
          id: "north-south-road",
          geometry: {
            type: "polyline",
            points: [
              { x: 40, y: 0 },
              { x: 40, y: 40 },
            ],
          },
          widthMeters: 8,
        },
      ],
      crosswalks: [
        {
          id: "crosswalk-ns",
          roadId: "north-south-road",
          position: { x: 40, y: 20 },
          widthMeters: 3,
        },
      ],
    });

    const plan = createSceneRenderPlan(scene, 0);
    const crosswalk = plan.primitives.find((p) => p.id === "crosswalk-crosswalk-ns");

    expect(crosswalk).toMatchObject({
      headingRadians: Math.PI / 2,
      roadWidthMeters: 8,
    });
  });

  it("falls back to a square (heading 0, its own widthMeters) when roadId no longer resolves to a real road", () => {
    const scene = parseScene({
      ...defaultDemoScene,
      crosswalks: [
        {
          id: "crosswalk-orphan",
          roadId: "a-road-that-was-deleted",
          position: { x: 5, y: 5 },
          widthMeters: 5,
        },
      ],
    });

    const plan = createSceneRenderPlan(scene, 0);
    const crosswalk = plan.primitives.find(
      (p) => p.id === "crosswalk-crosswalk-orphan",
    );

    expect(crosswalk).toMatchObject({
      headingRadians: 0,
      roadWidthMeters: 5,
    });
  });

  it("produces a traffic signal primitive from scene.trafficSignals (ADR-0023, previously produced nothing at all)", () => {
    const scene = parseScene({
      ...defaultDemoScene,
      trafficSignals: [
        {
          id: "signal-test",
          roadId: defaultDemoScene.roads[0].id,
          position: { x: 12, y: 3 },
          greenSeconds: 25,
          redSeconds: 15,
          offsetSeconds: 5,
        },
      ],
    });

    const plan = createSceneRenderPlan(scene, 0);

    expect(plan.primitives).toContainEqual(
      expect.objectContaining({
        id: "traffic-signal-signal-test",
        kind: "trafficSignal",
        position: { x: 12, y: 3 },
        radiusMeters: 1,
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
