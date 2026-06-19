import { describe, expect, it } from "vitest";
import { parseScene, safeParseScene, sceneSchema } from "./index";

const validScene = {
  schemaVersion: "1.0.0",
  id: "atrium-demo",
  name: "Atrium Demo",
  world: {
    width: 80,
    height: 48,
  },
  walls: [
    {
      id: "north-wall",
      geometry: {
        type: "polyline",
        points: [
          { x: 4, y: 4 },
          { x: 76, y: 4 },
        ],
      },
    },
  ],
  entrances: [
    {
      id: "main-entry",
      kind: "source",
      position: { x: 8, y: 44 },
      width: 4,
      arrivalRatePerMinute: 120,
    },
    {
      id: "east-exit",
      kind: "sink",
      position: { x: 76, y: 24 },
      width: 5,
    },
  ],
  areas: [
    {
      id: "walkable-floor",
      geometry: {
        type: "polygon",
        points: [
          { x: 0, y: 0 },
          { x: 80, y: 0 },
          { x: 80, y: 48 },
          { x: 0, y: 48 },
        ],
      },
    },
  ],
  targets: [
    {
      id: "info-desk",
      position: { x: 42, y: 20 },
    },
  ],
};

describe("sceneSchema", () => {
  it("parses a valid .csim.json scene and applies defaults", () => {
    const scene = parseScene(validScene);

    expect(sceneSchema.safeParse(validScene).success).toBe(true);
    expect(scene.units).toBe("meters");
    expect(scene.seed).toBe(1);
    expect(scene.walls[0].thickness).toBe(0.2);
    expect(scene.targets[0].radius).toBe(1);
    expect(scene.visualAssets).toEqual([]);
    expect(scene.basemaps).toEqual([]);
    expect(scene.floors).toEqual([]);
    expect(scene.zones).toEqual([]);
    expect(scene.storeLots).toEqual([]);
    expect(scene.brandProfiles).toEqual([]);
    expect(scene.shops).toEqual([]);
    expect(scene.servicePoints).toEqual([]);
    expect(scene.countLines).toEqual([]);
    expect(scene.environmentFactors).toEqual([]);
    expect(scene.roads).toEqual([]);
    expect(scene.buildings).toEqual([]);
    expect(scene.transitStops).toEqual([]);
    expect(scene.obstacles).toEqual([]);
    expect(scene.hazards).toEqual([]);
    expect(scene.weatherProfile.source).toBe("manual");
    expect(scene.weatherProfile.samples).toEqual([]);
    expect(scene.eventTimeline.events).toEqual([]);
    expect(scene.bioAgentProfiles).toEqual([]);
    expect(scene.visual.defaultView).toBe("topDown");
  });

  it("parses commercial editor objects and applies defaults", () => {
    const scene = parseScene({
      ...validScene,
      shops: [
        {
          id: "shop-a",
          brand: {
            category: "coffee",
            personaAffinity: {
              commuter: 0.9,
            },
            profileId: "coffee-pulse",
          },
          position: { x: 12, y: 16 },
          size: { width: 8, height: 5 },
        },
      ],
      servicePoints: [
        {
          id: "gate-a",
          kind: "gate",
          position: { x: 20, y: 18 },
        },
      ],
      countLines: [
        {
          id: "line-a",
          geometry: {
            type: "polyline",
            points: [
              { x: 1, y: 1 },
              { x: 9, y: 1 },
            ],
          },
        },
      ],
    });

    expect(scene.shops[0].attraction).toBe(1);
    expect(scene.shops[0].brand?.brandPower).toBe(0.5);
    expect(scene.shops[0].brand?.personaAffinity.commuter).toBe(0.9);
    expect(scene.shops[0].brand?.priceTier).toBe(3);
    expect(scene.shops[0].capacity).toBe(12);
    expect(scene.servicePoints[0].capacityPerMinute).toBe(60);
    expect(scene.countLines[0].geometry.points).toHaveLength(2);
  });

  it("parses 2.5D mall editor objects, brand profiles, and environment factors", () => {
    const scene = parseScene({
      ...validScene,
      basemaps: [
        {
          id: "floorplan-1f",
          floorId: "floor-1",
          sourceUri: "local://mall-1f.png",
          calibration: {
            imagePointA: { x: 10, y: 20 },
            imagePointB: { x: 410, y: 20 },
            realDistanceMeters: 40,
          },
        },
      ],
      floors: [
        {
          id: "floor-1",
          name: "Mall 1F",
          level: 1,
          basemapIds: ["floorplan-1f"],
        },
      ],
      zones: [
        {
          id: "jewelry-zone",
          floorId: "floor-1",
          category: "jewelry",
          geometry: {
            type: "polygon",
            points: [
              { x: 10, y: 10 },
              { x: 36, y: 10 },
              { x: 36, y: 24 },
              { x: 10, y: 24 },
            ],
          },
          customParameters: {
            securityLevel: "high",
          },
        },
      ],
      storeLots: [
        {
          id: "lot-diamond-a",
          zoneId: "jewelry-zone",
          shopId: "diamond-a",
          generated: true,
          geometry: {
            type: "polygon",
            points: [
              { x: 12, y: 12 },
              { x: 22, y: 12 },
              { x: 22, y: 20 },
              { x: 12, y: 20 },
            ],
          },
          entrancePosition: { x: 17, y: 20 },
        },
      ],
      brandProfiles: [
        {
          id: "aurora-diamond",
          name: "Aurora Diamond",
          category: "jewelry",
          brandPower: 0.86,
          personaAffinity: {
            luxuryBuyer: 0.92,
          },
        },
      ],
      shops: [
        {
          id: "diamond-a",
          floorId: "floor-1",
          zoneId: "jewelry-zone",
          storeLotId: "lot-diamond-a",
          name: "Aurora Diamond 1F",
          brand: {
            category: "jewelry",
            profileId: "aurora-diamond",
            brandPower: 0.86,
            personaAffinity: {
              luxuryBuyer: 0.92,
            },
          },
          position: { x: 17, y: 16 },
          entrancePosition: { x: 17, y: 20 },
          queueAnchor: { x: 17, y: 22 },
          size: { width: 10, height: 8 },
          customParameters: {
            displayCaseCount: 6,
          },
          visual: {
            style: "premium-jewelry",
            signText: "Aurora",
          },
        },
      ],
      environmentFactors: [
        {
          id: "fog-evening",
          kind: "fog",
          startsAtSeconds: 300,
          endsAtSeconds: 900,
          severity: 0.45,
          visibilityMultiplier: 0.55,
          routeCostMultiplier: 1.2,
          riskScore: 0.15,
        },
        {
          id: "promo-surge",
          kind: "promotionSurge",
          affectedAreaId: "jewelry-zone",
          startsAtSeconds: 600,
          speedMultiplier: 0.92,
          behaviorTags: ["brand-attraction", "queue-pressure"],
        },
      ],
      visual: {
        defaultView: "isometric",
      },
    });

    expect(scene.basemaps[0].opacity).toBe(0.65);
    expect(scene.floors[0].visible).toBe(true);
    expect(scene.zones[0].category).toBe("jewelry");
    expect(scene.zones[0].visual.heightMeters).toBe(3);
    expect(scene.storeLots[0].generated).toBe(true);
    expect(scene.brandProfiles[0].personaAffinity.luxuryBuyer).toBe(0.92);
    expect(scene.shops[0].brand?.category).toBe("jewelry");
    expect(scene.shops[0].conversionRate).toBe(0.3);
    expect(scene.environmentFactors[0].visibilityMultiplier).toBe(0.55);
    expect(scene.environmentFactors[1].behaviorTags).toContain("queue-pressure");
    expect(scene.visual.defaultView).toBe("isometric");
  });

  it("parses visual-only 3D model assets for BioCity rendering", () => {
    const scene = parseScene({
      ...validScene,
      visualAssets: [
        {
          id: "sketchup-street-canyon",
          kind: "gltf-scene",
          sourceUrl: "/assets/biocity/street-canyon.glb",
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

  it("rejects wall polylines with fewer than two points", () => {
    const result = safeParseScene({
      ...validScene,
      walls: [
        {
          id: "bad-wall",
          geometry: {
            type: "polyline",
            points: [{ x: 0, y: 0 }],
          },
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
