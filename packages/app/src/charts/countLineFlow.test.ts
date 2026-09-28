import { describe, expect, it } from "vitest";
import { buildCountLineFlowOption } from "./countLineFlow";

const flow = (minuteStartSeconds: number, forward: number, backward: number) => ({
  backward,
  forward,
  id: "gate",
  minuteStartSeconds,
  name: "Main gate",
});

describe("buildCountLineFlowOption", () => {
  it("sorts by minute and mirrors backward as negative values", () => {
    const option = buildCountLineFlowOption([flow(120, 3, 1), flow(0, 5, 2)], "en");

    const xAxis = option.xAxis as { data: number[] };
    expect(xAxis.data).toEqual([0, 2]);

    const [forwardSeries, backwardSeries] = option.series as {
      data: { value: number }[];
    }[];
    expect(forwardSeries.data.map((d) => d.value)).toEqual([5, 3]);
    expect(backwardSeries.data.map((d) => d.value)).toEqual([-2, -1]);
  });

  it("colours the busiest minute differently from the rest", () => {
    const option = buildCountLineFlowOption(
      [flow(0, 1, 1), flow(60, 9, 9), flow(120, 2, 1)],
      "en",
    );

    const [forwardSeries] = option.series as {
      data: { itemStyle: { color: string } }[];
    }[];
    const colours = forwardSeries.data.map((d) => d.itemStyle.color);
    expect(colours[1]).not.toBe(colours[0]);
    expect(colours[1]).not.toBe(colours[2]);
    expect(colours[0]).toBe(colours[2]);
  });

  it("does not throw on an empty count line", () => {
    expect(() => buildCountLineFlowOption([], "zh")).not.toThrow();
  });

  it("localizes the series names", () => {
    const en = buildCountLineFlowOption([flow(0, 1, 1)], "en");
    const zh = buildCountLineFlowOption([flow(0, 1, 1)], "zh");

    expect((en.series as { name: string }[])[0].name).toContain("forward");
    expect((zh.series as { name: string }[])[0].name).toContain("正向");
  });
});
