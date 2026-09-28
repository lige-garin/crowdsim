import { describe, expect, it } from "vitest";
import { buildSobolTornadoOption } from "./sobolTornado";
import type { SobolSummary } from "../analytics/sobolAnalysis";

const entry = (
  parameterId: string,
  firstOrder: number,
  totalOrder = firstOrder + 0.1,
): SobolSummary => ({
  firstOrder,
  parameterId,
  sampleCount: 8,
  totalOrder,
});

describe("buildSobolTornadoOption", () => {
  it("sorts by first-order index descending, unlike the pre-sorted Morris input", () => {
    // sobolIndicesFromOutputs does not sort — the option builder has to,
    // not just trust the array's own order the way sensitivityTornado.ts
    // does for its already-ranked Morris input.
    const option = buildSobolTornadoOption([
      entry("wallStrength", 0.2),
      entry("agentStrength", 0.8),
      entry("sidestep", 0.5),
    ]);

    const yAxis = option.yAxis as { data: string[]; inverse: boolean };
    expect(yAxis.data).toEqual(["agentStrength", "sidestep", "wallStrength"]);
    expect(yAxis.inverse).toBe(true);
  });

  it("plots each parameter's own first-order index, rounded to three decimals, in the same sorted order as the axis", () => {
    const option = buildSobolTornadoOption([
      entry("wallStrength", 0.2),
      entry("agentStrength", 0.812345),
    ]);

    const [series] = option.series as { data: number[] }[];
    expect(series.data).toEqual([0.812, 0.2]);
  });

  it("does not throw with no parameters", () => {
    expect(() => buildSobolTornadoOption([])).not.toThrow();
  });
});
