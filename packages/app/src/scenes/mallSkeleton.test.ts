import { describe, expect, it } from "vitest";
import { deriveSceneGeometry } from "../engine/simulationSceneConfig";
import { createMallSkeleton } from "./mallSkeleton";

const mall = createMallSkeleton({
  id: "test-mall",
  name: "Test Mall",
  world: { width: 120, height: 80 },
  atrium: { x: 60, y: 40 },
  floors: [
    {
      id: "l1",
      name: "Level 1",
      level: 0,
      zones: [
        { category: "cosmetics", rect: { x: 8, y: 8, width: 40, height: 16 } },
        { category: "jewelry", rect: { x: 56, y: 8, width: 40, height: 16 } },
      ],
    },
    {
      id: "l2",
      name: "Level 2",
      level: 1,
      zones: [{ category: "dining", rect: { x: 8, y: 8, width: 60, height: 16 } }],
    },
  ],
});

const zoneById = new Map(mall.zones.map((zone) => [zone.id, zone]));

describe("mall skeleton", () => {
  it("declares the floors in level order with an elevation each", () => {
    expect(mall.floors.map((floor) => floor.id)).toEqual(["l1", "l2"]);
    expect(mall.floors.map((floor) => floor.elevationMeters)).toEqual([0, 4.5]);
    expect(mall.floors.every((floor) => floor.world?.width === 120)).toBe(true);
  });

  it("walls every floor's perimeter so nobody walks out of the building", () => {
    expect(mall.walls).toHaveLength(2);
    expect(mall.walls.map((wall) => wall.floorId)).toEqual(["l1", "l2"]);
    expect(mall.walls.every((wall) => wall.geometry.points.length === 4)).toBe(true);
  });

  it("keeps the zone categories the caller asked for", () => {
    expect(mall.zones.map((zone) => zone.category)).toEqual([
      "cosmetics",
      "jewelry",
      "dining",
    ]);
  });

  it("cuts every zone into store lots, shops and brand profiles", () => {
    expect(mall.storeLots.length).toBeGreaterThan(0);
    expect(mall.shops).toHaveLength(mall.storeLots.length);
    expect(mall.brandProfiles).toHaveLength(mall.storeLots.length);
    expect(mall.shops.every((shop) => shop.storeLotId)).toBe(true);
  });

  it("puts every generated store on the floor its zone is on", () => {
    // The regression this guards: a shop with no `floorId` resolves to the
    // base floor, so an upper-floor zone produced ground-floor shops and the
    // mall's upper levels had no stores to visit at all.
    expect(mall.shops.some((shop) => shop.floorId === "l2")).toBe(true);

    for (const shop of mall.shops) {
      const zone = shop.zoneId ? zoneById.get(shop.zoneId) : undefined;
      expect(zone).toBeDefined();
      expect(shop.floorId).toBe(zone?.floorId);
    }

    for (const lot of mall.storeLots) {
      const zone = lot.zoneId ? zoneById.get(lot.zoneId) : undefined;
      expect(lot.floorId).toBe(zone?.floorId);
    }
  });

  it("runs escalators one way and gives each floor pair its own lift", () => {
    const escalators = mall.connectors.filter((c) => c.kind === "escalator");
    const lifts = mall.connectors.filter((c) => c.kind === "elevator");

    expect(escalators).toHaveLength(2);
    expect(lifts).toHaveLength(1);
    // An escalator runs one way; two flights, not one marked both ways.
    expect(escalators.every((c) => c.bidirectional === false)).toBe(true);
    expect(escalators.map((c) => `${c.from.floorId}>${c.to.floorId}`).sort()).toEqual([
      "l1>l2",
      "l2>l1",
    ]);
    expect(lifts[0]?.from.floorId).toBe("l1");
    expect(lifts[0]?.to.floorId).toBe("l2");
  });

  it("opens doors on the ground floor only", () => {
    const sources = mall.entrances.filter((e) => e.kind === "source");
    const sinks = mall.entrances.filter((e) => e.kind === "sink");

    expect(sources).toHaveLength(2);
    expect(sinks).toHaveLength(2);
    expect([...sources, ...sinks].every((e) => e.floorId === "l1")).toBe(true);
    expect(sources.every((e) => e.arrivalRatePerMinute > 0)).toBe(true);
  });

  it("does not put an arrival and a departure on the same spot", () => {
    // Someone who comes in and leaves by the same door never crosses the
    // floor, and crossing it is what a layout is being judged on.
    const sinks = mall.entrances.filter((e) => e.kind === "sink");

    for (const source of mall.entrances.filter((e) => e.kind === "source")) {
      for (const sink of sinks) {
        expect(
          Math.hypot(
            sink.position.x - source.position.x,
            sink.position.y - source.position.y,
          ),
        ).toBeGreaterThan(0);
      }
    }
  });

  it("is one the engine actually consumes, not just one the schema accepts", () => {
    const geometry = deriveSceneGeometry(mall, {}, () => 0.5);

    expect(geometry.floors.map((floor) => floor.id)).toEqual(["l1", "l2"]);
    // One plane per floor, each holding only its own walls.
    expect(geometry.floors.every((floor) => floor.walls.length > 0)).toBe(true);

    // Two one-way escalator flights stay two; the lift gains its return
    // direction because a car serves both ways (ADR-0010).
    expect(geometry.connectors.filter((c) => c.kind === "escalator")).toHaveLength(2);
    expect(geometry.connectors.filter((c) => c.kind === "elevator")).toHaveLength(2);

    expect(geometry.shops.some((shop) => shop.floorId === "l2")).toBe(true);
    expect(geometry.sources.every((source) => source.floorId === "l1")).toBe(true);
    expect(geometry.sinks.every((sink) => sink.floorId === "l1")).toBe(true);
  });

  it("builds a single-level mall with no vertical ways when no atrium is given", () => {
    const flat = createMallSkeleton({
      id: "flat",
      name: "Flat",
      world: { width: 60, height: 40 },
      floors: [
        {
          id: "ground",
          level: 0,
          zones: [{ category: "fashion", rect: { x: 4, y: 4, width: 40, height: 12 } }],
        },
      ],
    });

    expect(flat.floors).toHaveLength(1);
    expect(flat.connectors).toHaveLength(0);
    expect(flat.shops.every((shop) => shop.floorId === "ground")).toBe(true);
  });
});
