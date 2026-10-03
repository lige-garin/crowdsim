import { describe, expect, it } from "vitest";
import {
  fundamentalDiagramDensities,
  fundamentalDiagramMeasureSeconds,
  runFundamentalDiagramTest,
} from "./test04FundamentalDiagram";

/**
 * A small, cut-down measurement config (one density, a two-second window)
 * duplicated here and in `suite.test.ts` rather than shared: each file only
 * needs it for its own single call, and it is self-contained test fixture
 * data, not shared configuration.
 */
const cheap = {
  corridorRuns: 3,
  crowdPeople: 40,
  densities: [1],
  measureSeconds: 2,
  parameterStudyRows: 2,
} as const;

describe("test 4: the fundamental diagram", () => {
  /**
   * One density and a two-second window: enough to walk the code path, far too
   * little to be the test. The guideline's own sweep — seven densities, 60 s
   * each after a 10 s transient — takes the best part of a minute and runs in
   * the panel's worker, not here, so that a full test run stays quick.
   */
  it("reports a status, a measurement and the clause behind it", () => {
    const result = runFundamentalDiagramTest(cheap);

    expect(result.number).toBe(4);
    // Only that a verdict was reached, not which one: this config walks the
    // code path, it is not the guideline's sweep, so "pass" here would say
    // more about the model than this run can carry.
    expect(result.status).not.toBe("needs-scenario");
    expect(result.measured).toMatch(/worst deviation/u);
    expect(result.criterion).toContain("RiMEA 4.1.1 A 2 test 4");
    // The tolerance is this project's, and the corridor is not the
    // guideline's: both are said where the number is read.
    expect(result.criterion).toContain("self-authored");
    expect(result.criterion).toContain("periodic");
  });

  it("repeats: the same build gives the same answer", () => {
    expect(runFundamentalDiagramTest(cheap)).toEqual(runFundamentalDiagramTest(cheap));
  });

  it("defaults to the guideline's sweep, whatever a caller passes for a quick look", () => {
    expect(fundamentalDiagramDensities).toHaveLength(7);
    expect(fundamentalDiagramMeasureSeconds).toBe(60);
  });
});
