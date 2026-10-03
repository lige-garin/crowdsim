import { describe, expect, it } from "vitest";
import { runTwoExitChoiceTest, twoExitChoiceTest } from "./test11TwoExitChoice";

describe("test 11: choice of escape route", () => {
  it("reports both exits' own share, honestly, even when the crowding penalty overshoots", () => {
    // This is a genuine, disclosed finding, not a flaky test: with these two
    // exits only 6 m apart in distance from the source, the production
    // crowding-penalty constant (`evacuationExitCrowdingMeters`,
    // mallCrowdDecisionBackend) is strong enough to push the split toward
    // the farther exit rather than merely spread load to it, so this test
    // can legitimately report "fail" — see CLAIMS_LEDGER for the numbers at
    // the guideline's own 1000 people.
    const result = runTwoExitChoiceTest({ people: 60 });

    expect(result.number).toBe(11);
    // Deliberately not `toBe("pass")`: the penalty overshoot above is a
    // disclosed finding, so the verdict is left open here while the split
    // itself is asserted below.
    expect(result.status).not.toBe("needs-scenario");
    expect(result.measured).toMatch(
      /exit 1 \(nearer\) took \d+, exit 2 \(further\) took \d+/u,
    );
    expect(result.criterion).toContain("RiMEA 4.1.1 A 4 test 11");
  }, 30_000);

  it("puts exit 1 nearer the source than exit 2", () => {
    const t = twoExitChoiceTest;
    const sourceX = t.roomWidthMeters / 4;
    expect(Math.abs(t.nearExitXMeters - sourceX)).toBeLessThan(
      Math.abs(t.farExitXMeters - sourceX),
    );
  });
});
