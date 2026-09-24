import { describe, expect, it } from "vitest";
import { premovementTest, runPremovementTest } from "./test05Premovement";

describe("test 5: premovement time", () => {
  it("has each of ten people start moving within a decision tick of their own assigned time", () => {
    const result = runPremovementTest();

    expect(result.number).toBe(5);
    expect(result.status).toBe("pass");
    expect(result.measured).toMatch(/worst gap 0\.\d\d s/u);
    expect(result.criterion).toContain("RiMEA 4.1.1 A 2 test 5");
    // The tolerance is self-authored, and the criterion says so.
    expect(result.criterion).toContain("self-authored");
  }, 30_000);

  it("uses the guideline's own bounds, not this project's lognormal", () => {
    // A 2, p. 30. The lognormal (behaviorDistributions) has no upper bound
    // and a mean of 16 s; this window is a flat 10-100 s.
    expect(premovementTest.minReactionSeconds).toBe(10);
    expect(premovementTest.maxReactionSeconds).toBe(100);
  });

  it("repeats: the same seed gives the same answer", () => {
    expect(runPremovementTest(11)).toEqual(runPremovementTest(11));
  }, 30_000);
});
