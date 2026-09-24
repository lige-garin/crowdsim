import { describe, expect, it } from "vitest";
import {
  oneDimensionalJamDensityPerMeter,
  runOneDimensionalFundamentalDiagramTest,
} from "./test16OneDimensional";

describe("test 16: 1D fundamental diagram", () => {
  it("reports a measured speed at every density, judged only below this corridor's own jam", () => {
    const result = runOneDimensionalFundamentalDiagramTest({
      densities: [0.5, 1, 1.5],
      measureSeconds: 2,
    });

    expect(result.number).toBe(16);
    expect(["pass", "fail"]).toContain(result.status);
    expect(result.criterion).toContain("RiMEA 4.1.1 A 4 test 16");
    // There is no digitised reference here, and the criterion says why not.
    expect(result.criterion).toContain("not fetched here");
  });

  it("passes on the guideline's own densities, below this corridor's own jam", () => {
    const result = runOneDimensionalFundamentalDiagramTest();

    expect(result.status).toBe("pass");
    expect(result.measured).toContain("not judged");
  }, 60_000);

  it("puts the jam density where bodies would already be touching", () => {
    // bodyRadiusRangeMeters tops out at 0.26 m: two in line, back to back,
    // are 0.52 m apart, i.e. 1 / 0.52 people per metre.
    expect(oneDimensionalJamDensityPerMeter).toBeCloseTo(1 / 0.52, 5);
  });

  it("repeats: the same build gives the same answer", () => {
    const options = { densities: [0.5, 1], measureSeconds: 2 };
    expect(runOneDimensionalFundamentalDiagramTest(options)).toEqual(
      runOneDimensionalFundamentalDiagramTest(options),
    );
  });
});
