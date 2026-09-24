import { describe, expect, it } from "vitest";
import { parameterStudyTest, runParameterStudyTest } from "./test08ParameterStudy";

describe("test 8: parameter study", () => {
  it("reports total clear time at each of the guideline's own three speeds", () => {
    const result = runParameterStudyTest({
      groundRowCounts: [2, 2, 2, 2],
      upperRowCounts: [2, 2, 2, 2],
    });

    expect(result.number).toBe(8);
    for (const speed of parameterStudyTest.speedsMetersPerSecond) {
      expect(result.measured).toContain(`${speed} m/s`);
    }
    expect(result.criterion).toContain("recorded in graphs");
  }, 120_000);

  it("clears faster, not slower, at a higher speed", () => {
    const result = runParameterStudyTest({
      groundRowCounts: [1, 1, 1, 1],
      upperRowCounts: [1, 1, 1, 1],
    });

    expect(result.status).toBe("pass");
  }, 120_000);
});
