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
