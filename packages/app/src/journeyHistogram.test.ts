import { describe, expect, it } from "vitest";
import { buildJourneyTimeHistogramOption } from "./journeyHistogram";

describe("buildJourneyTimeHistogramOption", () => {
  it("bins durations into the requested number of equal-width buckets", () => {
    const option = buildJourneyTimeHistogramOption([1, 1, 5, 9, 9, 9], 5, 9, "en", 3);

    const [series] = option.series as { data: number[] }[];
    expect(series.data).toHaveLength(3);
    expect(series.data.reduce((a, b) => a + b, 0)).toBe(6);
  });

  it("does not throw and returns an empty series when there are no journeys yet", () => {
    expect(() => buildJourneyTimeHistogramOption([], 0, 0, "en")).not.toThrow();
    const option = buildJourneyTimeHistogramOption([], 0, 0, "en");
    expect(option.series).toEqual([]);
  });

  it("marks P50 and P90 as distinct mark lines", () => {
    const option = buildJourneyTimeHistogramOption([1, 5, 10, 20, 30], 10, 25, "en", 5);

    const [series] = option.series as {
      markLine: { data: { xAxis: number }[] };
    }[];
    const [p50Line, p90Line] = series.markLine.data;
    expect(p50Line.xAxis).not.toBe(p90Line.xAxis);
  });

  it("puts every duration in the last bucket when they are all identical (zero-width bins)", () => {
    const option = buildJourneyTimeHistogramOption([30, 30, 30], 30, 30, "en", 4);

    const [series] = option.series as { data: number[] }[];
    expect(series.data.reduce((a, b) => a + b, 0)).toBe(3);
  });
});
