import { describe, expect, it } from "vitest";
import { generateStoreLotsForZone } from "./storeLotGeneration";
import { createRouteCostMap, estimatePointRouteCost } from "./routeCostMap";
import { parseScene } from "@crowdsim/scene-schema";

const baseScene = parseScene({
  schemaVersion: "1.0.0",
  id: "route-cost-demo",
  name: "Route Cost Demo",
  world: { width: 60, height: 30 },
  zones: [
    {
      id: "cosmetics-zone",
      attraction: 0.8,
      category: "cosmetics",
      geometry: {
        type: "polygon",
        points: [
          { x: 5, y: 5 },
          { x: 30, y: 5 },
          { x: 30, y: 20 },
          { x: 5, y: 20 },
        ],
      },
    },
    {
      id: "blocked-zone",
      category: "emergency",
      geometry: {
        type: "polygon",
        points: [
          { x: 32, y: 5 },
          { x: 50, y: 5 },
          { x: 50, y: 20 },
          { x: 32, y: 20 },
        ],
      },
      walkable: false,
    },
  ],
});

describe("route cost map", () => {
  it("lowers cost for attractive generated store zones and raises blocked zones", () => {
    const { scene } = generateStoreLotsForZone(baseScene, "cosmetics-zone");
    const map = createRouteCostMap(scene);
    const cosmetics = map.cells.find((cell) => cell.zoneId === "cosmetics-zone")!;
    const blocked = map.cells.find((cell) => cell.zoneId === "blocked-zone")!;

    expect(cosmetics.attractionScore).toBeGreaterThan(0);
    expect(blocked.cost).toBeGreaterThan(cosmetics.cost);
    expect(estimatePointRouteCost(scene, { x: 10, y: 10 })).toBe(cosmetics.cost);
  });

  it("applies active smoke risk to route costs", () => {
    const scene = parseScene({
      ...baseScene,
      environmentFactors: [
        {
          id: "smoke",
          kind: "smoke",
          startsAtSeconds: 0,
          severity: 0.7,
        },
      ],
    });
    const clear = createRouteCostMap(baseScene);
    const smoke = createRouteCostMap(scene);

    expect(smoke.environmentFactorIds).toEqual(["smoke"]);
    expect(smoke.maxCost).toBeGreaterThan(clear.maxCost);
  });
});
