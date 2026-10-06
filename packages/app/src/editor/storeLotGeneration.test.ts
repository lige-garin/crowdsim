import { describe, expect, it } from "vitest";
import { parseScene } from "@crowdsim/scene-schema";
import { createAgentMindset } from "../engine/agentPersona";
import { createBrandStoresFromScene, rankBrandStores } from "../engine/brandAttraction";
import { generateStoreLotsForZone } from "./storeLotGeneration";

const scene = parseScene({
  schemaVersion: "1.0.0",
  id: "mall-zone",
  name: "Mall Zone",
  world: { width: 80, height: 40 },
  zones: [
    {
      id: "jewelry-zone",
      attraction: 0.8,
      category: "jewelry",
      dwellMeanSeconds: 220,
      geometry: {
        type: "polygon",
        points: [
          { x: 10, y: 10 },
          { x: 42, y: 10 },
          { x: 42, y: 22 },
          { x: 10, y: 22 },
        ],
      },
    },
  ],
});

describe("store lot generation", () => {
  it("splits a commercial zone into generated lots, shops and brand profiles", () => {
    const result = generateStoreLotsForZone(scene, "jewelry-zone");

    expect(result.summary.storeLotIds).toHaveLength(4);
    expect(result.scene.storeLots).toHaveLength(4);
    expect(result.scene.shops).toHaveLength(4);
    expect(result.scene.brandProfiles).toHaveLength(4);
    expect(result.scene.storeLots[0]).toMatchObject({
      generated: true,
      shopId: "shop-jewelry-zone-1",
      zoneId: "jewelry-zone",
    });
    expect(result.scene.shops[0]).toMatchObject({
      brand: {
        category: "jewelry",
        priceTier: 5,
        profileId: "brand-jewelry-zone-1",
      },
      storeLotId: "lot-jewelry-zone-1",
      zoneId: "jewelry-zone",
    });
    expect(result.scene.shops[0].capacity).toBeGreaterThan(4);
  });

  it("rejects unknown zones", () => {
    expect(() => generateStoreLotsForZone(scene, "missing")).toThrow("Unknown zone");
  });

  it("puts generated stores on the floor their zone is on", () => {
    // A scene that leaves `floorId` off a shop resolves it to the base floor
    // (see `resolveFloorId`), so a zone on an upper floor used to produce
    // ground-floor shops and a mall whose upper levels had no stores at all.
    const twoFloors = parseScene({
      ...scene,
      floors: [
        { id: "f1", level: 0 },
        { id: "f2", level: 1, elevationMeters: 4.5 },
      ],
      zones: [
        scene.zones[0],
        {
          ...scene.zones[0],
          id: "cosmetics-zone",
          category: "cosmetics",
          floorId: "f2",
        },
      ],
    });

    const result = generateStoreLotsForZone(twoFloors, "cosmetics-zone");

    expect(result.scene.shops).toHaveLength(4);
    expect(result.scene.shops.every((shop) => shop.floorId === "f2")).toBe(true);
    expect(result.scene.storeLots.every((lot) => lot.floorId === "f2")).toBe(true);
  });

  it("connects generated stores to brand attraction decisions", () => {
    const result = generateStoreLotsForZone(scene, "jewelry-zone");
    const stores = createBrandStoresFromScene(result.scene);
    const ranked = rankBrandStores(
      createAgentMindset({ agentId: 2, seed: 9 }),
      stores,
      {
        agentPosition: { x: 12, y: 24 },
      },
    );

    expect(stores).toHaveLength(4);
    expect(stores.every((store) => store.brand.category === "jewelry")).toBe(true);
    expect(ranked[0].probability).toBeGreaterThan(0);
    expect(ranked[0].reasons.join(" ")).toContain("brand affinity");
  });
});
