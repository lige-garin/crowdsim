import { describe, expect, it } from "vitest";
import { parseScene, safeParseScene } from "./index";
import { validScene } from "./sceneTestFixtures";

describe("sceneSchema BioCity extensions", () => {
  it("parses visual-only 3D model assets for BioCity rendering", () => {
    const scene = parseScene({
      ...validScene,
      visualAssets: [
        {
          id: "sketchup-street-canyon",
          kind: "gltf-scene",
          sourceUrl: "/assets/biocity/street-canyon.glb",
          lodSources: {
            high: "/assets/biocity/street-canyon.high.glb",
            low: "/assets/biocity/street-canyon.low.glb",
            medium: "/assets/biocity/street-canyon.medium.glb",
          },
          originalSourceFormat: "sketchup",
          anchor: { x: 40, y: 24 },
          calibration: {
            accuracyMeters: 0.35,
            simulationProxy: {
              entityId: "walkable-floor",
              kind: "area",
            },
            unitScaleMeters: 0.0254,
            upAxis: "z-up",
            verified: true,
          },
          rotationDegrees: 12,
          scale: 0.8,
          attribution: "Converted from stakeholder SketchUp massing model",
        },
        {
          id: "bus-shelter-prop",
          kind: "gltf-prop",
          sourceUrl: "/assets/biocity/bus-shelter.glb",
          anchor: { x: 58, y: 34, z: 0.1 },
        },
      ],
    });

    expect(scene.visualAssets[0]).toMatchObject({
      collisionMode: "none",
      id: "sketchup-street-canyon",
      calibration: {
        accuracyMeters: 0.35,
        origin: "scene-anchor",
        simulationProxy: {
          entityId: "walkable-floor",
          kind: "area",
          role: "alignment-only",
        },
        unitScaleMeters: 0.0254,
        upAxis: "z-up",
        verified: true,
      },
      lod: "medium",
      lodSources: {
        high: "/assets/biocity/street-canyon.high.glb",
        low: "/assets/biocity/street-canyon.low.glb",
        medium: "/assets/biocity/street-canyon.medium.glb",
      },
      originalSourceFormat: "sketchup",
      visible: true,
    });
    expect(scene.visualAssets[0].anchor.z).toBe(0);
    expect(scene.visualAssets[1].calibration).toMatchObject({
      origin: "scene-anchor",
      unitScaleMeters: 1,
      upAxis: "y-up",
      verified: false,
    });
    expect(scene.visualAssets[1].lodSources).toEqual({});
    expect(scene.visualAssets[1].scale).toBe(1);
  });

  it("parses BioCity objects and applies defaults", () => {
    const scene = parseScene({
      ...validScene,
      roads: [
        {
          id: "main-street",
          geometry: {
            type: "polyline",
            points: [
              { x: 6, y: 34 },
              { x: 72, y: 34 },
            ],
          },
        },
      ],
      crosswalks: [
        {
          id: "main-street-crossing",
          roadId: "main-street",
          position: { x: 40, y: 34 },
        },
      ],
      buildings: [
        {
          id: "market-hall",
          kind: "retail",
          footprint: {
            type: "polygon",
            points: [
              { x: 16, y: 12 },
              { x: 36, y: 12 },
              { x: 36, y: 24 },
              { x: 16, y: 24 },
            ],
          },
          entrancePosition: { x: 26, y: 24 },
          visitorCapacity: 420,
        },
      ],
      transitStops: [
        {
          id: "bus-stop-east",
          roadId: "main-street",
          kind: "bus",
          position: { x: 58, y: 34 },
        },
      ],
      obstacles: [
        {
          id: "rain-barrier",
          kind: "constructionBarrier",
          geometry: {
            type: "polyline",
            points: [
              { x: 40, y: 28 },
              { x: 50, y: 28 },
            ],
          },
        },
      ],
      hazards: [
        {
          id: "minor-flooding",
          kind: "flood",
          position: { x: 48, y: 32 },
          startsAtSeconds: 600,
          endsAtSeconds: 1200,
          speedMultiplier: 0.72,
        },
      ],
      weatherProfile: {
        id: "rainy-afternoon",
        source: "manual",
        samples: [
          {
            startsAtSeconds: 0,
            condition: "heavyRain",
            temperatureC: 19,
            precipitationMmPerHour: 11,
            windSpeedMetersPerSecond: 7,
          },
        ],
      },
      eventTimeline: {
        id: "storm-ops",
        events: [
          {
            id: "close-main-street",
            kind: "roadClose",
            startsAtSeconds: 900,
            endsAtSeconds: 1500,
            targetId: "main-street",
          },
        ],
      },
      bioAgentProfiles: [
        {
          id: "rainy-commuter",
          name: "Rainy Commuter",
          kind: "commuter",
          weatherSensitivity: 0.82,
        },
      ],
    });

    expect(scene.roads[0].widthMeters).toBe(6);
    expect(scene.roads[0].vehicleAccessible).toBe(false);
    expect(scene.roads[0].vehicleArrivalRatePerMinute).toBe(0);
    expect(scene.roads[0].vehicleSpeedLimitMetersPerSecond).toBeCloseTo(8.33, 2);
    expect(scene.crosswalks[0].widthMeters).toBe(3);
    expect(scene.buildings[0].floors).toBe(5);
    expect(scene.transitStops[0].capacity).toBe(80);
    expect(scene.obstacles[0].blocksMovement).toBe(true);
    expect(scene.hazards[0].riskScore).toBe(0.3);
    expect(scene.weatherProfile.samples[0].durationSeconds).toBe(3600);
    expect(scene.weatherProfile.samples[0].humidityPercent).toBe(50);
    expect(scene.eventTimeline.timeScale).toBe(1);
    expect(scene.eventTimeline.events[0].payload).toEqual({});
    expect(scene.bioAgentProfiles[0].baseSpeedMetersPerSecond).toBe(1.35);
  });

  it("rejects invalid brand attraction inputs", () => {
    const result = safeParseScene({
      ...validScene,
      shops: [
        {
          id: "shop-a",
          brand: {
            brandPower: 1.2,
            category: "luxury",
            profileId: "luxury-a",
          },
          position: { x: 12, y: 16 },
          size: { width: 8, height: 5 },
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects environment factors that end before they start", () => {
    const result = safeParseScene({
      ...validScene,
      environmentFactors: [
        {
          id: "bad-smoke",
          kind: "smoke",
          startsAtSeconds: 120,
          endsAtSeconds: 60,
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects hazards that end before they start", () => {
    const result = safeParseScene({
      ...validScene,
      hazards: [
        {
          id: "bad-flood",
          kind: "flood",
          position: { x: 20, y: 20 },
          startsAtSeconds: 300,
          endsAtSeconds: 120,
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects city events that end before they start", () => {
    const result = safeParseScene({
      ...validScene,
      eventTimeline: {
        events: [
          {
            id: "bad-road-close",
            kind: "roadClose",
            startsAtSeconds: 300,
            endsAtSeconds: 120,
          },
        ],
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects duplicate entity ids across scene collections", () => {
    const result = safeParseScene({
      ...validScene,
      targets: [{ id: "main-entry", position: { x: 12, y: 12 } }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects duplicate entity ids across BioCity collections", () => {
    const result = safeParseScene({
      ...validScene,
      roads: [
        {
          id: "shared-biocity-id",
          geometry: {
            type: "polyline",
            points: [
              { x: 8, y: 8 },
              { x: 30, y: 8 },
            ],
          },
        },
      ],
      hazards: [
        {
          id: "shared-biocity-id",
          kind: "roadClosure",
          position: { x: 20, y: 8 },
        },
      ],
      eventTimeline: {
        events: [
          {
            id: "close-road",
            kind: "roadClose",
            startsAtSeconds: 60,
          },
          {
            id: "close-road",
            kind: "roadOpen",
            startsAtSeconds: 120,
          },
        ],
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects unsafe visual asset imports", () => {
    const result = safeParseScene({
      ...validScene,
      visualAssets: [
        {
          id: "remote-model",
          kind: "gltf-prop",
          sourceUrl: "https://example.com/model.glb",
          anchor: { x: 10, y: 10 },
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects unsafe visual asset LOD source imports", () => {
    const result = safeParseScene({
      ...validScene,
      visualAssets: [
        {
          id: "bad-lod-model",
          kind: "gltf-prop",
          sourceUrl: "/assets/biocity/model.glb",
          lodSources: {
            low: "https://example.com/model.low.glb",
          },
          anchor: { x: 10, y: 10 },
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
