import { describe, expect, it } from "vitest";
import { buildSensitivityTornadoOption } from "./sensitivityTornado";
import type { MorrisSummary } from "./sensitivityAnalysis";

const entry = (
  parameterId: string,
  meanAbsoluteEffect: number,
  stdDevEffect = 0.1,
): MorrisSummary => ({
  meanAbsoluteEffect,
  meanEffect: meanAbsoluteEffect,
  parameterId,
  sampleCount: 6,
  stdDevEffect,
});

describe("buildSensitivityTornadoOption", () => {
  it("keeps the caller's order (already μ*-descending) and inverts the axis so the top parameter reads first", () => {
    const option = buildSensitivityTornadoOption([
      entry("agentStrength", 0.8),
      entry("wallStrength", 0.2),
    ]);

    const yAxis = option.yAxis as { data: string[]; inverse: boolean };
    expect(yAxis.data).toEqual(["agentStrength", "wallStrength"]);
    expect(yAxis.inverse).toBe(true);
  });

  it("plots each parameter's own μ*, rounded to three decimals", () => {
    const option = buildSensitivityTornadoOption([entry("agentStrength", 0.812345)]);

    const [series] = option.series as { data: number[] }[];
    expect(series.data).toEqual([0.812]);
  });

  it("does not throw with no parameters", () => {
    expect(() => buildSensitivityTornadoOption([])).not.toThrow();
  });
});
