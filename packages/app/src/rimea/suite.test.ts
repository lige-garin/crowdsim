import { describe, expect, it } from "vitest";
import {
  fundamentalDiagramDensities,
  fundamentalDiagramMeasureSeconds,
  fundamentalDiagramTransientSeconds,
} from "./test04FundamentalDiagram";
import { runRimeaSuite, summarizeRimeaSuite, unattemptedRimeaTests } from "./suite";

/**
 * The cut-down measurement: one density, two seconds, a few dozen people
 * instead of the guideline's hundreds/thousands. The guideline's own sweep
 * and headcounts belong in the panel's worker, not in a test run — see
 * `runFundamentalDiagramTest` and `runRimeaSuite`'s own `crowdPeople`.
 */
const cheap = {
  corridorRuns: 3,
  crowdPeople: 40,
  densities: [1],
  measureSeconds: 2,
  parameterStudyRows: 2,
} as const;
const suite = runRimeaSuite(cheap);

describe("the RiMEA suite's own honesty", () => {
  it("lists all sixteen tests once each, in the guideline's order", () => {
    expect(suite).toHaveLength(16);
    expect(suite.map((result) => result.number)).toEqual(
      Array.from({ length: 16 }, (_, index) => index + 1),
    );
  });

  it("says why each unattempted test was not attempted", () => {
    for (const result of unattemptedRimeaTests) {
      expect(result.status).toBe("needs-scenario");
      // Each one names the clause it comes from, so the list can be worked
      // through without going back to the PDF to find out what it wants.
      expect(result.blockedBy).toMatch(/A \d|p\. \d/u);
      // An unattempted test never carries a measurement, which would read as
      // though it had been run.
      expect(result.measured).toBeUndefined();
    }
  });

  it("counts what is built against what is not", () => {
    const summary = summarizeRimeaSuite(suite);

    // Tests 1-13 and 15-16 are built (15 of them); only 14 names its clause
    // instead. Pinned to the exact pass/fail split, not just their sum: a
    // test that individually asserts `["pass","fail"]).toContain(status)`
    // (4, 11 — both real, disclosed findings whose actual guideline-scale
    // status differs from what this cheap harness measures, see their own
    // describe blocks) still has a single deterministic outcome *under this
    // specific cheap parameterization*, so a silent flip here is either a
    // real regression in the step it exercises or the seeded randomness
    // changing underneath it — either way worth a red test, not just a
    // preserved sum that a flip on one side and a flip on the other could
    // cancel out.
    expect(summary.pass).toBe(15);
    expect(summary.fail).toBe(0);
    expect(summary.needsScenario).toBe(1);
    expect(summary.total).toBe(16);
  });

  it("uses the densities and the timing the guideline asks for", () => {
    // A 2, test 4, p. 30.
    expect(fundamentalDiagramDensities).toEqual([0.5, 1, 2, 3, 4, 5, 6]);
    expect(fundamentalDiagramMeasureSeconds).toBe(60);
    expect(fundamentalDiagramTransientSeconds).toBe(10);
  });
});
