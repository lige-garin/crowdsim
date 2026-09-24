import type { RimeaStatus, RimeaTestResult } from "./shared";
import { runFundamentalDiagramTest } from "./test04FundamentalDiagram";
import { runCorridorSpeedTest } from "./test01Corridor";
import { runStairSpeedTest } from "./test02_03StairSpeed";
import { runPremovementTest } from "./test05Premovement";
import { runCornerTest } from "./test06Corner";
import { runDemographicSpeedTest } from "./test07DemographicSpeed";
import { runParameterStudyTest } from "./test08ParameterStudy";
import { runLargePublicSpaceTest } from "./test09LargePublicSpace";
import { runEscapeRouteAllocationTest } from "./test10EscapeRoute";
import { runTwoExitChoiceTest } from "./test11TwoExitChoice";
import { runBottleneckTest } from "./test12Bottleneck";
import { runStairCrowdTest } from "./test13StairCrowd";
import { runLargeCornerTest } from "./test15LargeCorner";
import { runOneDimensionalFundamentalDiagramTest } from "./test16OneDimensional";

/**
 * The sixteen tests, from the guideline's own table of contents (Annex 1,
 * A 2–A 4, pp. 29–48 of version 4.1.1).
 *
 * Titles are the guideline's English headings. The German version is the
 * authoritative one and says so on its first content page; where a criterion
 * below is quoted it is from the English column, which the guideline itself
 * does not guarantee.
 */
export const unattemptedRimeaTests: readonly RimeaTestResult[] = [
  {
    number: 14,
    title: "Choice of route",
    status: "needs-scenario",
    blockedBy:
      'A 4, p. 44 (its Fig. 18): a start and target connected by two stairs and a corridor on the ground floor, and by a longer corridor on the upper floor — but the figure is an undimensioned isometric schematic, unlike every other test here (re-confirmed 2026-09-22 at 400 DPI, after Fig. 3/7/16 all turned out to have real, readable data once actually read at that resolution instead of remembered: this one genuinely has no numbers anywhere on the page). The text asks only a qualitative question ("short"/"long"/"mixed"/"configurable") with no geometry to grade an answer against. Building it would mean inventing every length RiMEA does not give, not reading them off the page.',
  },
];

/**
 * Every test, in the guideline's order, with the one that has been built in
 * place. Running it measures — seconds of it — so the panel calls this in a
 * worker; `options` exists only so a test can walk the path cheaply.
 *
 * `crowdPeople` overrides all four crowd-scale tests (9, 11, 12, 15) at
 * once, to the same headcount — a single cheap knob rather than four, since
 * a test walking the code path does not care that the guideline gives each
 * of them a different real number (1000, 1000, 150, 500). `parameterStudyRows`
 * does the same for test 8's own building, one row count in place of its
 * four (ground and upper floors alike) — its real building is 448 people
 * across three floors, too slow to walk in every test run.
 */
export function runRimeaSuite(
  options: Parameters<typeof runFundamentalDiagramTest>[0] & {
    corridorRuns?: number;
    crowdPeople?: number;
    parameterStudyRows?: number;
  } = {},
): readonly RimeaTestResult[] {
  const parameterStudyRowCounts: [number, number, number, number] | undefined =
    options.parameterStudyRows === undefined
      ? undefined
      : [
          options.parameterStudyRows,
          options.parameterStudyRows,
          options.parameterStudyRows,
          options.parameterStudyRows,
        ];

  return [
    ...unattemptedRimeaTests,
    runCorridorSpeedTest(options.corridorRuns),
    runDemographicSpeedTest(),
    runParameterStudyTest({
      groundRowCounts: parameterStudyRowCounts,
      upperRowCounts: parameterStudyRowCounts,
    }),
    runPremovementTest(),
    runStairSpeedTest("up"),
    runStairSpeedTest("down"),
    runCornerTest(),
    runFundamentalDiagramTest(options),
    runOneDimensionalFundamentalDiagramTest(options),
    runEscapeRouteAllocationTest(),
    runLargePublicSpaceTest({ people: options.crowdPeople }),
    runTwoExitChoiceTest({ people: options.crowdPeople }),
    runBottleneckTest({ people: options.crowdPeople }),
    runLargeCornerTest({ people: options.crowdPeople }),
    runStairCrowdTest(),
  ].sort((left, right) => left.number - right.number);
}

/** How many tests sit in each status, for a one-line summary. */
export function summarizeRimeaSuite(results: readonly RimeaTestResult[]) {
  const count = (status: RimeaStatus) =>
    results.filter((result) => result.status === status).length;

  return {
    fail: count("fail"),
    needsScenario: count("needs-scenario"),
    pass: count("pass"),
    total: results.length,
  };
}
