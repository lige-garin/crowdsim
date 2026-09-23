import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RimeaStatusGrid } from "./RimeaStatusGrid";
import type { RimeaTestResult } from "./rimeaSuite";

afterEach(cleanup);

const result = (
  number: number,
  status: RimeaTestResult["status"],
): RimeaTestResult => ({
  number,
  status,
  title: `Test ${number}`,
});

describe("RimeaStatusGrid", () => {
  it("draws one tile per test, sorted by RiMEA's own numbering regardless of input order", () => {
    render(
      <RimeaStatusGrid
        language="en"
        results={[result(3, "pass"), result(1, "fail"), result(2, "needs-scenario")]}
      />,
    );

    const grid = screen.getByRole("img", { name: "All 16 at a glance" });
    const tiles = grid.querySelectorAll(".rimea-tile");
    expect([...tiles].map((tile) => tile.textContent)).toEqual(["1", "2", "3"]);
  });

  it("colours each tile by its own status", () => {
    render(
      <RimeaStatusGrid
        language="en"
        results={[result(1, "pass"), result(2, "fail"), result(3, "needs-scenario")]}
      />,
    );

    expect(screen.getByText("1")).toHaveClass("rimea-tile-pass");
    expect(screen.getByText("2")).toHaveClass("rimea-tile-fail");
    expect(screen.getByText("3")).toHaveClass("rimea-tile-needs-scenario");
  });

  it("puts the test title and localized status in the tile's tooltip", () => {
    render(
      <RimeaStatusGrid
        language="zh"
        results={[{ number: 4, status: "fail", title: "走廊基本图" }]}
      />,
    );

    expect(screen.getByText("4")).toHaveAttribute("title", "4. 走廊基本图 — 未通过");
  });
});
