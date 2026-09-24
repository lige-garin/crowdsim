import { describe, expect, it } from "vitest";
import { buildSensitivityScatterOption } from "./sensitivityScatter";
import type { MorrisSummary } from "./sensitivityAnalysis";

const entry = (
  parameterId: string,
  meanAbsoluteEffect: number,
  stdDevEffect: number,
): MorrisSummary => ({
  meanAbsoluteEffect,
  meanEffect: meanAbsoluteEffect,
  parameterId,
  sampleCount: 6,
  stdDevEffect,
});

describe("buildSensitivityScatterOption", () => {
  it("plots each parameter as a [μ*, σ] point, in the same order it was given", () => {
    const option = buildSensitivityScatterOption([
      entry("agentStrength", 0.8, 0.05),
      entry("wallStrength", 0.2, 0.18),
    ]);

    const [series] = option.series as { data: [number, number][] }[];
    expect(series.data).toEqual([
      [0.8, 0.05],
      [0.2, 0.18],
    ]);
  });

  it("rounds both coordinates to three decimals", () => {
    const option = buildSensitivityScatterOption([
      entry("agentStrength", 0.812345, 0.0567),
    ]);

    const [series] = option.series as { data: [number, number][] }[];
    expect(series.data).toEqual([[0.812, 0.057]]);
  });

  it("names the parameter and both statistics in the tooltip", () => {
    const option = buildSensitivityScatterOption([entry("agentStrength", 0.8, 0.05)]);

    const formatter = (
      option.tooltip as { formatter: (params: { dataIndex: number }) => string }
    ).formatter;
    expect(formatter({ dataIndex: 0 })).toContain("agentStrength");
    expect(formatter({ dataIndex: 0 })).toContain("0.800");
    expect(formatter({ dataIndex: 0 })).toContain("0.050");
  });

  it("does not throw with no parameters", () => {
    expect(() => buildSensitivityScatterOption([])).not.toThrow();
  });
});
