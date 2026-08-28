import { describe, expect, it } from "vitest";
import { parseScene, safeParseScene, sceneSchema } from "./index";
import { validScene } from "./sceneTestFixtures";

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
