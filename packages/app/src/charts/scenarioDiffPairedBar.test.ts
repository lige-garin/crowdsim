import { describe, expect, it } from "vitest";
import { buildScenarioDiffPairedBarOption } from "./scenarioDiffPairedBar";
import type { MetricComparison } from "../analytics/scenarioDiffReport";

const metric = (overrides: Partial<MetricComparison> = {}): MetricComparison => ({
  delta: 2,
  deltaPercent: 20,
  direction: "lowerIsBetter",
  key: "peakDensity",
  label: "Peak density",
  scenarioAValue: 10,
  scenarioBValue: 12,
  unit: "P/m²",
  ...overrides,
});

describe("buildScenarioDiffPairedBarOption", () => {
  it("plots scenario A's value and scenario B's value as the two bars, in that order", () => {
    const option = buildScenarioDiffPairedBarOption(metric(), "Alpha", "Beta");

    const [series] = option.series as { data: { value: number }[] }[];
    expect(series.data.map((point) => point.value)).toEqual([10, 12]);
  });

  it("labels the axis with the scenario names, not generic A/B", () => {
    const option = buildScenarioDiffPairedBarOption(metric(), "Alpha", "Beta");

    const yAxis = option.yAxis as { data: string[] };
    expect(yAxis.data).toEqual(["Alpha", "Beta"]);
  });

  it("colours the two bars distinctly so they read as different scenarios, not a gradient", () => {
    const option = buildScenarioDiffPairedBarOption(metric(), "Alpha", "Beta");

    const [series] = option.series as { data: { itemStyle: { color: string } }[] }[];
    expect(series.data[0].itemStyle.color).not.toBe(series.data[1].itemStyle.color);
  });
});
