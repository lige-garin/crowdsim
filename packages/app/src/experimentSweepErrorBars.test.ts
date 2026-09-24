import { describe, expect, it } from "vitest";
import { buildExperimentSweepErrorBarOption } from "./experimentSweepErrorBars";
import type { MetricDistribution } from "./experimentSweep";

const distribution = (
  overrides: Partial<MetricDistribution> = {},
): MetricDistribution => ({
  ci95: { high: 34, low: 30 },
  max: 35,
  mean: 32,
  min: 29,
  p50: 32,
  p95: 34,
  runs: 5,
  samples: [29, 31, 32, 33, 35],
  ...overrides,
});

describe("buildExperimentSweepErrorBarOption", () => {
  it("draws a box spanning exactly the confidence interval, with the mean as its median", () => {
    const option = buildExperimentSweepErrorBarOption({
      wide: distribution({ ci95: { high: 34, low: 30 }, mean: 32 }),
    });

    const [series] = option.series as { data: number[][] }[];
    expect(series.data).toEqual([[30, 30, 32, 34, 34]]);
  });

  it("leaves out variants with no interval (a single run) rather than drawing a fabricated zero-width box", () => {
    const option = buildExperimentSweepErrorBarOption({
      narrow: distribution({ ci95: null, mean: 12, runs: 1 }),
      wide: distribution({ ci95: { high: 34, low: 30 }, mean: 32 }),
    });

    const xAxis = option.xAxis as { data: string[] };
    expect(xAxis.data).toEqual(["wide"]);
  });

  it("does not throw when nothing has an interval yet", () => {
    expect(() =>
      buildExperimentSweepErrorBarOption({
        narrow: distribution({ ci95: null, runs: 1 }),
      }),
    ).not.toThrow();
  });
});
