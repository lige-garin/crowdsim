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
    // The default demo scene is fully procedural (no visualAssets), so the
    // asset-mapping half of the plan is exercised on an inline fixture in
    // the dedicated test below and in sceneModelAssets.test.ts.
    expect(plan.assets).toEqual([]);
  });

  it("draws what a click in the 3D world can place", () => {
    const plan = createSceneRenderPlan(defaultDemoScene, 0);

    // An exit placed in the 3D world used to change nothing on screen: the
    // placement succeeded and reached the running simulation, but the render
    // plan had no primitive for it, so the click looked like it did nothing.
    const exits = defaultDemoScene.entrances.filter(
      (entrance) => entrance.kind !== "source",
    );
    expect(exits.length).toBeGreaterThan(0);
    for (const exit of exits) {
      expect(plan.primitives.some((p) => p.id === `entrance-${exit.id}`)).toBe(true);
    }

    expect(plan.primitives.some((primitive) => primitive.kind === "marker")).toBe(true);

    // The default demo scene carries no zone or count line, so those two ride
    // on a fixture: both are placeable in the 3D world too.
    const planWithMore = createSceneRenderPlan(
      parseScene({
        ...defaultDemoScene,
        zones: [
          {
            id: "z-1",
            category: "atrium",
            geometry: {
              type: "polygon",
              points: [
                { x: 10, y: 10 },
                { x: 30, y: 10 },
                { x: 30, y: 30 },
              ],
            },
          },
        ],
        countLines: [
          {
            id: "cl-1",
            geometry: {
              type: "polyline",
              points: [
                { x: 5, y: 5 },
                { x: 25, y: 5 },
              ],
            },
          },
        ],
      }),
      0,
    );

    expect(planWithMore.primitives.map((primitive) => primitive.kind)).toEqual(
      expect.arrayContaining(["zone", "line"]),
    );
  });

  it("maps scene.visualAssets into render-plan assets", () => {
    const scene = parseScene({
      ...defaultDemoScene,
      visualAssets: [
        {
          id: "test-streetscape",
          name: "Test Streetscape",
          kind: "gltf-scene",
          sourceUrl: "/assets/test-scene/streetscape.glb",
          lodSources: {
            high: "/assets/test-scene/streetscape.high.glb",
            low: "/assets/test-scene/streetscape.low.glb",
            medium: "/assets/test-scene/streetscape.glb",
          },
          originalSourceFormat: "sketchup",
          anchor: { x: 80, y: 48, z: 0 },
          calibration: {
            accuracyMeters: 0.5,
            simulationProxy: {
              entityId: "downtown-walkable",
              kind: "area",
            },
            unitScaleMeters: 1,
            upAxis: "y-up",
            verified: true,
          },
          rotationDegrees: 0,
          scale: 1,
        },
        {
          id: "test-shelter",
          name: "Test Shelter",
          kind: "gltf-prop",
          sourceUrl: "/assets/test-scene/shelter.glb",
          lodSources: {
            low: "/assets/test-scene/shelter.low.glb",
          },
          originalSourceFormat: "glb",
          anchor: { x: 122, y: 72, z: 0 },
          calibration: {
            accuracyMeters: 0.2,
            simulationProxy: {
              entityId: "rain-market-bus-stop",
              kind: "transitStop",
            },
            unitScaleMeters: 1,
            upAxis: "y-up",
            verified: true,
          },
          scale: 0.9,
        },
      ],
    });

    const plan = createSceneRenderPlan(scene, 0);

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
          id: "asset-test-streetscape",
          kind: "gltf-scene",
          lod: "medium",
          lodSources: expect.objectContaining({
            low: "/assets/test-scene/streetscape.low.glb",
          }),
          sourceUrl: "/assets/test-scene/streetscape.glb",
        }),
        expect.objectContaining({
          id: "asset-test-shelter",
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
