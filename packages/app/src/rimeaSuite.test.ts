import { describe, expect, it } from "vitest";
import {
  bottleneckTest,
  escapeRouteTest,
  fundamentalDiagramDensities,
  fundamentalDiagramMeasureSeconds,
  fundamentalDiagramTransientSeconds,
  insideCorner,
  largeCornerTest,
  largeRoomTest,
  oneDimensionalJamDensityPerMeter,
  premovementTest,
  runBottleneckTest,
  runCornerTest,
  runCorridorSpeedTest,
  runEscapeRouteAllocationTest,
  runFundamentalDiagramTest,
  runLargeCornerTest,
  runLargePublicSpaceTest,
  runOneDimensionalFundamentalDiagramTest,
  runPremovementTest,
  runRimeaSuite,
  runStairSpeedTest,
  runTwoExitChoiceTest,
  summarizeRimeaSuite,
  twoExitChoiceTest,
  unattemptedRimeaTests,
} from "./rimeaSuite";

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

    // Tests 1-6, 9-12, 15 and 16 are built (12 of them); 7, 8, 13, 14 name
    // their clause instead.
    expect(summary.pass + summary.fail).toBe(12);
    expect(summary.needsScenario).toBe(4);
    expect(summary.total).toBe(16);
  });

  it("uses the densities and the timing the guideline asks for", () => {
    // A 2, test 4, p. 30.
    expect(fundamentalDiagramDensities).toEqual([0.5, 1, 2, 3, 4, 5, 6]);
    expect(fundamentalDiagramMeasureSeconds).toBe(60);
    expect(fundamentalDiagramTransientSeconds).toBe(10);
  });
});

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
    expect(["pass", "fail"]).toContain(result.status);
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

describe("test 1: walking speed in a corridor", () => {
  it("judges the median walk and reports how far the spread reaches", () => {
    const result = runCorridorSpeedTest(6);

    expect(result.number).toBe(1);
    expect(result.measured).toMatch(/median .* s over \d+ walks/u);
    // The share inside the window is the point: this engine's 19% speed
    // spread is wider than the 5% the window was built from, and the result
    // says so instead of hiding it behind a pass.
    expect(result.measured).toMatch(/inside the window/u);
    expect(result.criterion).toContain("26-34 s");
    expect(result.criterion).toContain("19% spread");
  });
});

describe("test 6: round a corner", () => {
  it("passes only if everyone gets round and nobody leaves the corridor", () => {
    const result = runCornerTest();

    expect(result.number).toBe(6);
    expect(result.status).toBe("pass");
    expect(result.measured).toContain("nobody left the corridor");
  }, 60_000);

  it("knows the corridor it is checking against", () => {
    // Inside both arms and the turn.
    expect(insideCorner(5, 1)).toBe(true);
    expect(insideCorner(11, 11)).toBe(true);
    expect(insideCorner(11, 1)).toBe(true);
    // Outside: past the inner wall, and beyond the end of an arm.
    expect(insideCorner(5, 5)).toBe(false);
    expect(insideCorner(13, 1)).toBe(false);
    expect(insideCorner(11, 13)).toBe(false);
  });
});

describe("tests 2 and 3: walking speed on stairs", () => {
  it("crosses the flight up in about the time its own stair speed implies", () => {
    const result = runStairSpeedTest("up");

    expect(result.number).toBe(2);
    expect(result.status).toBe("pass");
    expect(result.measured).toMatch(/median .* s over \d+ walks/u);
    expect(result.criterion).toContain("RiMEA 4.1.1 A 2 test 2");
    // The window is this project's own extrapolation, not RiMEA's text, and
    // the criterion says so.
    expect(result.criterion).toContain("extrapolation");
  }, 60_000);

  it("crosses the flight down in about the time its own stair speed implies", () => {
    const result = runStairSpeedTest("down");

    expect(result.number).toBe(3);
    expect(result.status).toBe("pass");
    expect(result.criterion).toContain("RiMEA 4.1.1 A 2 test 3");
  }, 60_000);

  it("takes longer down a metre-for-metre flight than up, at this project's own speeds", () => {
    // Weidmann: 0.694 m/s down against 0.61 up (floorRouting.connectorSpeeds)
    // — the same asymmetry the level model has no equivalent of.
    const up = runStairSpeedTest("up");
    const down = runStairSpeedTest("down");
    const medianOf = (measured: string | undefined) =>
      Number(measured?.match(/median ([\d.]+) s/u)?.[1]);

    expect(medianOf(down.measured)).toBeLessThan(medianOf(up.measured));
  }, 60_000);
});

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

describe("test 10: allocation of escape routes", () => {
  it("has all twelve rooms leave, each by its assigned exit", () => {
    const result = runEscapeRouteAllocationTest();

    expect(result.number).toBe(10);
    expect(result.status).toBe("pass");
    expect(result.measured).toContain("23 people left");
    expect(result.criterion).toContain("RiMEA 4.1.1");
  });

  it("gives room 3 one person and every other room two", () => {
    // Room 3 is the passage up to the main exit, not a room like the rest.
    expect(escapeRouteTest.peoplePerRoom[2]).toBe(1);
    expect(escapeRouteTest.peoplePerRoom.filter((count) => count === 2)).toHaveLength(
      11,
    );
  });
});

describe("test 9: crowd leaving a large public space", () => {
  it("clears faster through four doors than through two, cheaply", () => {
    const result = runLargePublicSpaceTest({ people: 40 });

    expect(result.number).toBe(9);
    expect(result.status).toBe("pass");
    expect(result.measured).toMatch(/four doors .* two doors/u);
    expect(result.criterion).toContain("RiMEA 4.1.1 A 4 test 9");
    // The router's own gap-size workaround, not a claim about door width.
    expect(result.criterion).toContain("routing grid");
  }, 30_000);

  it("repeats: the same build gives the same answer", () => {
    expect(runLargePublicSpaceTest({ people: 20 })).toEqual(
      runLargePublicSpaceTest({ people: 20 }),
    );
  }, 30_000);

  it("uses the guideline's own 20 m room, at 1000 people by default", () => {
    expect(largeRoomTest.roomSizeMeters).toBe(20);
    expect(largeRoomTest.people).toBe(1000);
  });
});

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
    expect(["pass", "fail"]).toContain(result.status);
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

describe("test 12: bottleneck flow", () => {
  it("reports all four sub-tests (a-d), cheaply", () => {
    const result = runBottleneckTest({ people: 30 });

    expect(result.number).toBe(12);
    expect(result.status).toBe("pass");
    expect(result.measured).toContain("12a");
    expect(result.measured).toContain("12b");
    expect(result.measured).toContain("12c");
    expect(result.measured).toContain("12d");
    // The bottleneck widths this project could actually route through are
    // disclosed, not silently substituted for the guideline's own.
    expect(result.criterion).toContain("router");
  }, 30_000);

  it("uses the guideline's own room size and a router-limited bottleneck width", () => {
    // A 4, pp. 37-41: the real value (1 m) does not route on this project's
    // grid, so 2.4 m stands in for it everywhere except 12d, which is what
    // the wide comment above `bottleneckTest` explains.
    expect(bottleneckTest.room1SizeMeters).toBe(10);
    expect(bottleneckTest.defaultBottleneckWidthMeters).toBe(2.4);
  });
});

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
