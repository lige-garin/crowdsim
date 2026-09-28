import { describe, expect, it } from "vitest";
import { buildPlacesRankingOption } from "./placesRanking";

describe("buildPlacesRankingOption", () => {
  it("keeps the input order and inverts the axis so the first (busiest) place reads at the top", () => {
    const option = buildPlacesRankingOption([
      { label: "Cafe", visits: 20 },
      { label: "Newsstand", visits: 5 },
    ]);

    const yAxis = option.yAxis as { data: string[]; inverse: boolean };
    expect(yAxis.data).toEqual(["Cafe", "Newsstand"]);
    expect(yAxis.inverse).toBe(true);
  });

  it("does not throw with no places", () => {
    expect(() => buildPlacesRankingOption([])).not.toThrow();
  });

  it("keeps visit counts paired with their own label", () => {
    const option = buildPlacesRankingOption([
      { label: "Cafe", visits: 20 },
      { label: "Newsstand", visits: 5 },
    ]);

    const [series] = option.series as { data: number[] }[];
    expect(series.data).toEqual([20, 5]);
  });
});
