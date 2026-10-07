import { describe, expect, it } from "vitest";
import { parseScene } from "@crowdsim/scene-schema";
import { createMallSkeleton } from "./mallSkeleton";
import {
  applyShopLayoutToLot,
  applyShopLayoutToShop,
  planShopLayout,
  priceTierForAverageTicket,
  sizeForArea,
} from "./shopLayout";

const restaurant = {
  lot: { x: 0, y: 0, width: 20, height: 14 },
  tables: { twoSeat: 6, fourSeat: 10, sixSeat: 4, privateRoom10: 2 },
};

describe("shop layout", () => {
  it("turns table counts into seats", () => {
    const layout = planShopLayout(restaurant);

    // 6x2 + 10x4 + 4x6 + 2x10
    expect(layout.capacity).toBe(96);
    expect(layout.tables).toHaveLength(22);
  });

  it("puts the door on the side it was asked for and the queue outside it", () => {
    const south = planShopLayout(restaurant);
    const north = planShopLayout({ ...restaurant, doorEdge: "north" });
    const west = planShopLayout({ ...restaurant, doorEdge: "west" });

    expect(south.entrancePosition).toEqual({ x: 10, y: 14 });
    expect(south.queueAnchor).toEqual({ x: 10, y: 16 });
    expect(north.entrancePosition).toEqual({ x: 10, y: 0 });
    expect(north.queueAnchor).toEqual({ x: 10, y: -2 });
    expect(west.entrancePosition).toEqual({ x: 0, y: 7 });
    expect(west.queueAnchor).toEqual({ x: -2, y: 7 });
  });

  it("leaves private rooms open on the aisle side, because a wall has no doorway", () => {
    const layout = planShopLayout(restaurant);

    // A closed room would need a doorway cut through it, and this project
    // only cuts doorways through a building footprint — so a room is three
    // walls, not four, and nobody is ever sealed in.
    expect(layout.rooms).toHaveLength(2);
    expect(layout.rooms.every((room) => room.points.length === 4)).toBe(true);
    const first = layout.rooms[0]?.points ?? [];
    expect(new Set(first.map((p) => `${p.x},${p.y}`)).size).toBe(4);
  });

  it("refuses a lot the tables cannot fit in", () => {
    // "This area cannot hold these tables" is arithmetic, not inference: it
    // is one of the few things here that is checkable rather than guessed.
    expect(() =>
      planShopLayout({
        lot: { x: 0, y: 0, width: 6, height: 6 },
        tables: { twoSeat: 6, fourSeat: 10, sixSeat: 4, privateRoom10: 2 },
      }),
    ).toThrow(/do not fit/);

    // Smaller than the wall inset on both axes: nothing usable at all.
    expect(() =>
      planShopLayout({ lot: { x: 0, y: 0, width: 0.4, height: 0.4 }, tables: {} }),
    ).toThrow(/too small/);

    // Big enough to inset (1.4 x 0.9 usable), but the 1.2 m aisle eats it.
    expect(() =>
      planShopLayout({ lot: { x: 0, y: 0, width: 2, height: 1.5 }, tables: {} }),
    ).toThrow(/no room behind/);
  });

  it("reports how much of the lot the furniture takes", () => {
    const layout = planShopLayout(restaurant);

    expect(layout.lotAreaSquareMeters).toBe(280);
    // 6x0.64 + 10x1.44 + 4x2.16 + 2x16
    expect(layout.tableAreaSquareMeters).toBeCloseTo(58.88, 2);
  });
});

describe("price tier", () => {
  it("maps an average spend onto the 1-5 tier the brand schema carries", () => {
    expect(priceTierForAverageTicket(20)).toBe(1);
    expect(priceTierForAverageTicket(45)).toBe(2);
    expect(priceTierForAverageTicket(85)).toBe(3);
    expect(priceTierForAverageTicket(180)).toBe(4);
    expect(priceTierForAverageTicket(400)).toBe(5);
  });
});

describe("applying a layout to a scene", () => {
  const mall = createMallSkeleton({
    id: "mall",
    name: "Mall",
    world: { width: 120, height: 80 },
    atrium: { x: 60, y: 40 },
    floors: [
      {
        id: "l1",
        level: 0,
        zones: [{ category: "dining", rect: { x: 8, y: 8, width: 40, height: 20 } }],
      },
    ],
  });
  const firstLot = mall.storeLots[0];

  it("gives the shop its capacity, door and queue, and blocks on the tables", () => {
    // The lot rectangle is taken from the lot's own geometry, not from this
    // spec: passing a different one used to drop the furniture at the origin
    // while the shop stayed on its lot.
    const fitted = applyShopLayoutToLot(mall, firstLot.id, {
      lot: { x: 0, y: 0, width: 20, height: 14 },
      tables: { fourSeat: 4, privateRoom10: 1 },
    });

    const shop = fitted.shops.find((candidate) => candidate.storeLotId === firstLot.id);
    const xs = firstLot.geometry.points.map((point) => point.x);
    const maxY = Math.max(...firstLot.geometry.points.map((point) => point.y));
    // On the lot's own south edge, midway along it.
    expect(shop?.entrancePosition).toEqual({
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: maxY,
    });
    expect(shop?.queueAnchor).toEqual({
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: maxY + 2,
    });
    expect(shop?.capacity).toBe(26);

    const furniture = fitted.obstacles.filter((obstacle) =>
      obstacle.id.startsWith(`${shop?.id}-table-`),
    );
    expect(furniture).toHaveLength(5);
    expect(furniture.every((obstacle) => obstacle.kind === "furniture")).toBe(true);
    // Furniture has to block, or a crowded layout would not show up as one.
    expect(furniture.every((obstacle) => obstacle.blocksMovement)).toBe(true);
    expect(furniture.every((obstacle) => obstacle.floorId === firstLot.floorId)).toBe(
      true,
    );

    const rooms = fitted.walls.filter((wall) =>
      wall.id.startsWith(`${shop?.id}-room-`),
    );
    expect(rooms).toHaveLength(1);
  });

  it("sets the price tier from an average spend", () => {
    const fitted = applyShopLayoutToLot(
      mall,
      firstLot.id,
      { lot: { x: 0, y: 0, width: 20, height: 14 }, tables: { fourSeat: 4 } },
      { averageTicketYuan: 85 },
    );

    const shop = fitted.shops.find((candidate) => candidate.storeLotId === firstLot.id);
    expect(shop?.brand?.priceTier).toBe(3);
  });

  it("re-lays the same lot without stacking a second set of tables on it", () => {
    const spec = {
      lot: { x: 0, y: 0, width: 20, height: 14 },
      tables: { fourSeat: 4, privateRoom10: 1 },
    };
    const once = applyShopLayoutToLot(mall, firstLot.id, spec);
    const twice = applyShopLayoutToLot(once, firstLot.id, spec);

    const shopId = once.shops.find((c) => c.storeLotId === firstLot.id)?.id ?? "";

    expect(
      twice.obstacles.filter((o) => o.id.startsWith(`${shopId}-table-`)),
    ).toHaveLength(5);
    expect(twice.walls.filter((w) => w.id.startsWith(`${shopId}-room-`))).toHaveLength(
      1,
    );
  });
});

describe("applying a layout to a shop with no lot", () => {
  // A street site: the bundle gives it a shop with a position and a size and
  // nothing else. There is no store lot to read a rectangle off, so the
  // shop's own rectangle is all there is.
  const street = parseScene({
    schemaVersion: "1.0.0",
    id: "street",
    name: "Street site",
    world: { width: 200, height: 120 },
    shops: [
      {
        id: "site-shop",
        name: "老四季",
        position: { x: 100, y: 60 },
        size: { width: 21.9, height: 14.6 },
      },
    ],
  });

  it("lays it out inside the shop's own rectangle, not at the origin", () => {
    const fitted = applyShopLayoutToShop(street, "site-shop", {
      lot: { x: 0, y: 0, width: 1, height: 1 },
      tables: { fourSeat: 4 },
    });

    expect(fitted.shops[0]?.capacity).toBe(16);
    expect(fitted.obstacles).toHaveLength(4);
    // Every table has to land around the shop: furniture at the origin is the
    // bug this path exists to avoid, and it is invisible in a test that only
    // counts obstacles.
    expect(
      fitted.obstacles.every((obstacle) =>
        obstacle.geometry.points.every((point) => point.x > 85 && point.y > 45),
      ),
    ).toBe(true);
  });

  it("changes the shop when the form asks for a different area", () => {
    const fitted = applyShopLayoutToShop(
      street,
      "site-shop",
      { lot: { x: 0, y: 0, width: 1, height: 1 }, tables: { fourSeat: 4 } },
      { size: sizeForArea(320) },
    );
    const shop = fitted.shops[0];

    expect((shop?.size.width ?? 0) * (shop?.size.height ?? 0)).toBeCloseTo(320, 0);
  });

  it("writes the ticket price and table mix back, so the form can be reopened", () => {
    const fitted = applyShopLayoutToShop(
      street,
      "site-shop",
      { lot: { x: 0, y: 0, width: 1, height: 1 }, tables: { fourSeat: 4 } },
      { averageTicketYuan: 85 },
    );
    const stored = fitted.shops[0]?.customParameters ?? {};

    expect(stored.averageTicketYuan).toBe(85);
    expect(stored.tables).toEqual({ fourSeat: 4 });
    // The schema keeps a 1-5 tier, not a yuan figure, so without this the
    // form could not be reopened on the shop it had just produced.
  });

  it("refuses a shop the scene does not have", () => {
    expect(() =>
      applyShopLayoutToShop(street, "no-such-shop", {
        lot: { x: 0, y: 0, width: 10, height: 10 },
        tables: {},
      }),
    ).toThrow(/Unknown shop/);
  });
});
