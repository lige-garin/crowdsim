import { describe, expect, it } from "vitest";
import { runStairCrowdTest, stairCrowdBandAt } from "./test13StairCrowd";

describe("test 13: fundamental diagram on stairs", () => {
  it("interpolates the digitised band and returns null outside its domain", () => {
    // Exact gridline point.
    expect(stairCrowdBandAt("up", 1.0)).toEqual({ high: 0.86, low: 0.46 });
    // Midway between 0.6 and 0.8 is the average of the two.
    const midway = stairCrowdBandAt("up", 0.7)!;
    expect(midway.high).toBeCloseTo((1.02 + 0.93) / 2);
    expect(midway.low).toBeCloseTo((0.48 + 0.46) / 2);
    // Below 0.6 and above 1.5, Fig. 16 was not digitised — no band to fail.
    expect(stairCrowdBandAt("up", 0.1)).toBeNull();
    expect(stairCrowdBandAt("down", 3)).toBeNull();
    // Descending's own slowest quartile is faster than climbing's at every
    // gridline this project read — the clean, unambiguous half of the
    // guideline's own claim. Its fastest quartile is not asserted the same
    // way: the two bands' upper edges visually converge and, at the
    // domain's own far end (1.5 P/m2), cross by 0.01 m/s in this project's
    // reading — well inside the error of reading a printed chart by eye,
    // not a claim either the guideline or this digitisation actually
    // supports at that precision.
    for (const density of [0.6, 0.8, 1.0, 1.2, 1.4, 1.5]) {
      const up = stairCrowdBandAt("up", density)!;
      const down = stairCrowdBandAt("down", density)!;
      expect(down.low).toBeGreaterThan(up.low);
    }
  });

  it("matches Fig. 16's band on a majority of samples, descending faster than climbing", () => {
    const result = runStairCrowdTest();

    expect(result.number).toBe(13);
    expect(result.status).toBe("pass");
    expect(result.measured).toMatch(/up: \d+ samples/u);
    expect(result.measured).toMatch(/down: \d+ samples/u);
    expect(result.measured).toContain("descending faster");
    expect(result.criterion).toContain("Fig. 16");
  }, 60_000);
});
