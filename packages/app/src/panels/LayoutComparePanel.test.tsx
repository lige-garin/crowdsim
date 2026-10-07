import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LayoutComparePanel } from "./LayoutComparePanel";
import { createMallSkeleton } from "../scenes/mallSkeleton";
import { applyShopLayoutToLot } from "../scenes/shopLayout";
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

const lot = mall.storeLots[0]!;
const spec = { lot: { x: 0, y: 0, width: 20, height: 14 } } as const;

const sparse = applyShopLayoutToLot(mall, lot.id, {
  ...spec,
  tables: { fourSeat: 2 },
});
const dense = applyShopLayoutToLot(mall, lot.id, {
  ...spec,
  tables: { fourSeat: 10, sixSeat: 4, privateRoom10: 1 },
});

function renderPanel(scene = sparse) {
  render(
    <I18nProvider>
      <LayoutComparePanel scene={scene} />
    </I18nProvider>,
  );
}

describe("LayoutComparePanel", () => {
  it("cannot run until both schemes are saved", () => {
    renderPanel();

    expect(screen.getByTestId("layout-compare-run")).toBeDisabled();

    fireEvent.click(screen.getByTestId("layout-compare-save-a"));
    expect(screen.getByTestId("layout-compare-run")).toBeDisabled();

    fireEvent.click(screen.getByTestId("layout-compare-save-b"));
    expect(screen.getByTestId("layout-compare-run")).toBeEnabled();
  });

  it("keeps the two schemes across a remount", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("layout-compare-save-a"));
    cleanup();

    renderPanel(dense);
    const slots = screen.getByTestId("layout-compare-slots").textContent ?? "";

    expect(slots).toContain("A：Mall");
    expect(slots).toContain("（空）");
  });

  it("leads the report with the caveat, not with a number", async () => {
    renderPanel(sparse);
    fireEvent.click(screen.getByTestId("layout-compare-save-a"));
    cleanup();

    renderPanel(dense);
    fireEvent.click(screen.getByTestId("layout-compare-save-b"));
    fireEvent.change(screen.getByTestId("layout-compare-duration"), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByTestId("layout-compare-run"));

    const report = await waitFor(() => screen.getByTestId("layout-compare-report"), {
      timeout: 60_000,
    });

    // The first line of the report is the disclaimer: a reader who takes an
    // absolute number out of here has been mis-sold.
    expect(report.querySelector("li")?.textContent).toContain("绝对数值不可用于预测");
    expect(report.textContent).toContain("方案「Mall」");
    // Seven measures, one line each.
    expect(report.querySelectorAll("li").length).toBeGreaterThanOrEqual(9);
  }, 90_000);
});
