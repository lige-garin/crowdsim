import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EChart } from "./EChart";

afterEach(cleanup);

describe("EChart", () => {
  it("renders an aria-labelled container without crashing when canvas 2D is unavailable", () => {
    // jsdom in this project's test setup has no `canvas` package installed,
    // so `getContext("2d")` returns null -- the exact environment EChart.tsx
    // feature-detects for. This is the decisive case: without that guard,
    // this test crashes with an uncaught exception from zrender's own paint
    // loop (confirmed while building the guard, not assumed).
    const { getByRole } = render(
      <EChart
        ariaLabel="probe chart"
        option={{
          series: [{ data: [1, 2, 3], type: "bar" }],
          xAxis: { data: ["a", "b", "c"], type: "category" },
          yAxis: { type: "value" },
        }}
      />,
    );

    expect(getByRole("img", { name: "probe chart" })).toBeInTheDocument();
  });
});
