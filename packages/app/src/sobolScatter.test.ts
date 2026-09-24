import { describe, expect, it } from "vitest";
import { buildSobolScatterOption } from "./sobolScatter";
import type { SobolSummary } from "./sobolAnalysis";

const entry = (
  parameterId: string,
  firstOrder: number,
  totalOrder: number,
): SobolSummary => ({
  firstOrder,
  parameterId,
  sampleCount: 8,
  totalOrder,
});

describe("buildSobolScatterOption", () => {
  it("plots each parameter as a [firstOrder, totalOrder] point, in the same order it was given", () => {
    const option = buildSobolScatterOption([
      entry("agentStrength", 0.8, 0.9),
      entry("wallStrength", 0.2, 0.5),
    ]);

    const [series] = option.series as { data: [number, number][] }[];
    expect(series.data).toEqual([
      [0.8, 0.9],
      [0.2, 0.5],
    ]);
  });

  it("rounds both coordinates to three decimals", () => {
    const option = buildSobolScatterOption([entry("agentStrength", 0.812345, 0.9876)]);

    const [series] = option.series as { data: [number, number][] }[];
    expect(series.data).toEqual([[0.812, 0.988]]);
  });

  it("names the parameter and both indices in the tooltip", () => {
    const option = buildSobolScatterOption([entry("agentStrength", 0.8, 0.9)]);

    const formatter = (
      option.tooltip as { formatter: (params: { dataIndex: number }) => string }
    ).formatter;
    expect(formatter({ dataIndex: 0 })).toContain("agentStrength");
    expect(formatter({ dataIndex: 0 })).toContain("0.800");
    expect(formatter({ dataIndex: 0 })).toContain("0.900");
  });

  it("does not throw with no parameters", () => {
    expect(() => buildSobolScatterOption([])).not.toThrow();
  });
});
