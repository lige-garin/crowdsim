import { describe, expect, it } from "vitest";
import { largeCornerTest, runLargeCornerTest } from "./test15LargeCorner";

describe("test 15: a large crowd around a corner", () => {
  it("has the corner's clear time fall between the two straight routes, cheaply", () => {
    const result = runLargeCornerTest({ people: 40 });

    expect(result.number).toBe(15);
    expect(result.status).toBe("pass");
    expect(result.measured).toMatch(/short straight .* corner .* long straight/u);
    expect(result.criterion).toContain("RiMEA 4.1.1 A 4 test 15");
  }, 30_000);

  it("uses the guideline's own three route lengths", () => {
    expect(largeCornerTest.straightShortLengthMeters).toBe(44);
    expect(largeCornerTest.straightLongLengthMeters).toBe(75.4);
    expect(
      largeCornerTest.cornerVerticalLengthMeters +
        largeCornerTest.cornerHorizontalLengthMeters,
    ).toBe(64);
  });
});
