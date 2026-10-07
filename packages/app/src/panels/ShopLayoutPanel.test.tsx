import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import { ShopLayoutPanel } from "./ShopLayoutPanel";
import { createMallSkeleton } from "../scenes/mallSkeleton";
import { I18nProvider } from "../i18n";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

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

/** A street site: one shop, no store lot, so the shop's own rectangle is all
 * the geometry there is. */
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

/**
 * A street site imported from a bundle: one shop, no lot, a brand the importer
 * gave priceTier 3, and no yuan figure anywhere — the importer writes
 * `areaSquareMeters` and `tables` into customParameters, not a ticket.
 */
const bundled = parseScene({
  schemaVersion: "1.0.0",
  id: "bundled",
  name: "Bundled site",
  world: { width: 200, height: 120 },
  shops: [
    {
      id: "bundled-shop",
      name: "老四季",
      position: { x: 100, y: 60 },
      size: { width: 21.9, height: 14.6 },
      brand: {
        name: "老四季",
        category: "restaurant",
        priceTier: 3,
        profileId: "site-shop-brand",
      },
      customParameters: { areaSquareMeters: 320, tables: {} },
    },
  ],
});

function renderPanel(scene: CrowdSimScene) {
  const applied: CrowdSimScene[] = [];

  render(
    <I18nProvider>
      <ShopLayoutPanel scene={scene} onApplyScene={(next) => applied.push(next)} />
    </I18nProvider>,
  );

  return applied;
}

function set(testId: string, value: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value } });
}

describe("ShopLayoutPanel", () => {
  it("shows the seats a table mix produces before anything is applied", () => {
    renderPanel(mall);

    set("shop-layout-table-fourSeat", "4");

    expect(screen.getByTestId("shop-layout-preview").textContent).toContain("16");
  });

  it("applies the plan to the shop on the lot", () => {
    const applied = renderPanel(mall);

    set("shop-layout-table-fourSeat", "4");
    set("shop-layout-table-privateRoom10", "1");
    fireEvent.click(screen.getByTestId("shop-layout-apply"));

    expect(applied).toHaveLength(1);
    const shop = applied[0]?.shops.find((candidate) => candidate.storeLotId);
    expect(shop?.capacity).toBe(26);
    // 4 four-seat tables and one private room, as obstacles and walls.
    expect(applied[0]?.obstacles.length).toBeGreaterThanOrEqual(5);
    expect(applied[0]?.walls.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("shop-layout-applied")).toBeInTheDocument();
  });

  it("will not apply a mix that does not fit, and says why", () => {
    const applied = renderPanel(mall);

    set("shop-layout-table-privateRoom10", "400");

    expect(screen.getByTestId("shop-layout-error").textContent).toMatch(/do not fit/);
    expect(screen.getByTestId("shop-layout-apply")).toBeDisabled();

    fireEvent.click(screen.getByTestId("shop-layout-apply"));
    expect(applied).toHaveLength(0);
  });

  it("says so when the scene has no shop to lay out", () => {
    renderPanel(
      parseScene({
        schemaVersion: "1.0.0",
        id: "empty",
        name: "Empty",
        world: { width: 40, height: 40 },
      }),
    );

    expect(screen.getByTestId("shop-layout-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("shop-layout-apply")).toBeNull();
  });

  it("takes the area as an input for a shop with no lot, and locks it on a lot", () => {
    renderPanel(mall);
    expect(screen.getByTestId("shop-layout-area")).toBeDisabled();
    cleanup();

    renderPanel(street);
    expect(screen.getByTestId("shop-layout-area")).toBeEnabled();
    expect(screen.queryByTestId("shop-layout-area-locked")).toBeNull();
  });

  it("refuses to apply a shop with no tables instead of throwing", () => {
    // The bundle path: tables come back empty, and `shopSchema.capacity` is
    // positive. Applied, that is a ZodError thrown from a click handler.
    const applied = renderPanel(bundled);

    expect(screen.getByTestId("shop-layout-error").textContent).toMatch(
      /No tables to place/,
    );
    expect(screen.getByTestId("shop-layout-apply")).toBeDisabled();

    fireEvent.click(screen.getByTestId("shop-layout-apply"));
    expect(applied).toHaveLength(0);
  });

  it("keeps a bundled shop's price tier when the ticket was never filled in", () => {
    const applied = renderPanel(bundled);

    set("shop-layout-table-fourSeat", "4");
    fireEvent.click(screen.getByTestId("shop-layout-apply"));

    // Not 1: an untouched empty box is not a price of zero, and reclassifying
    // a mid-market shop as the cheapest tier is not something a click on
    // "layout the tables" should do.
    expect(applied[0]?.shops[0]?.brand?.priceTier).toBe(3);
    expect(screen.getByTestId("shop-layout-ticket-unset")).toBeInTheDocument();
  });

  it("reclassifies the tier when a ticket is actually typed", () => {
    const applied = renderPanel(bundled);

    set("shop-layout-table-fourSeat", "4");
    set("shop-layout-ticket", "300");
    fireEvent.click(screen.getByTestId("shop-layout-apply"));

    expect(applied[0]?.shops[0]?.brand?.priceTier).toBe(5);
  });

  it("drops the previous scene's form when it is keyed to a new scene", () => {
    const other = parseScene({
      schemaVersion: "1.0.0",
      id: "other",
      name: "Other site",
      world: { width: 200, height: 120 },
      shops: [
        {
          id: "other-shop",
          name: "别的店",
          position: { x: 100, y: 60 },
          size: { width: 21.9, height: 14.6 },
        },
      ],
    });
    const applied: CrowdSimScene[] = [];
    // Mounted the way the registry mounts it: keyed by scene id, so a scene
    // swap is a fresh mount. This test would fail against a plain rerender,
    // which is the point — it is the registry's key doing the work.
    const { rerender } = render(
      <I18nProvider>
        <ShopLayoutPanel
          key={street.id}
          scene={street}
          onApplyScene={(next) => applied.push(next)}
        />
      </I18nProvider>,
    );

    set("shop-layout-name", "老四季旗舰店");
    set("shop-layout-table-fourSeat", "4");
    rerender(
      <I18nProvider>
        <ShopLayoutPanel
          key={other.id}
          scene={other}
          onApplyScene={(next) => applied.push(next)}
        />
      </I18nProvider>,
    );

    set("shop-layout-table-fourSeat", "2");
    fireEvent.click(screen.getByTestId("shop-layout-apply"));

    // Without the key the second scene's shop would be renamed and refurnished
    // from the first one's form.
    expect(applied[0]?.shops[0]?.name).toBe("别的店");
    expect(applied[0]?.shops[0]?.capacity).toBe(8);
  });

  it("resizes a standalone shop to the area the form asked for", () => {
    const applied = renderPanel(street);

    set("shop-layout-area", "320");
    set("shop-layout-table-fourSeat", "4");
    fireEvent.click(screen.getByTestId("shop-layout-apply"));

    const shop = applied[0]?.shops[0];
    expect((shop?.size.width ?? 0) * (shop?.size.height ?? 0)).toBeCloseTo(320, 0);
    // Furniture round the shop, not at the origin: the same check the
    // non-UI path has, because this is the path a street site takes.
    expect(
      applied[0]?.obstacles.every((obstacle) =>
        obstacle.geometry.points.every((point) => point.x > 85),
      ),
    ).toBe(true);
  });
});
