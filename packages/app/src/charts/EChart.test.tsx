import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { sameChartOption } from "./chartOptionEqual";
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

/**
 * Every chart panel builds its option inline in JSX, so the option is a new
 * object on every render — the identity check that would normally keep a chart
 * from redrawing never fires. This comparison is what the skip stands on, so it
 * gets tested directly: a chart cannot be drawn in jsdom (no canvas 2D), but
 * whether two options are the same picture can be.
 */
describe("sameChartOption", () => {
  const option = () => ({
    series: [{ data: [1, 2, 3], type: "bar" as const }],
    tooltip: { formatter: () => "people" },
    xAxis: { data: ["a", "b", "c"], type: "category" as const },
  });

  it("says two separately built but identical options are the same", () => {
    expect(sameChartOption(option(), option())).toBe(true);
  });

  it("says an option whose data moved is different", () => {
    const next = option();
    next.series[0].data = [1, 2, 4];
    expect(sameChartOption(option(), next)).toBe(false);
  });

  it("counts a changed formatter as a change, not as the same picture", () => {
    const next = option();
    next.tooltip.formatter = () => "people per minute";
    expect(sameChartOption(option(), next)).toBe(false);
  });
});
