import { bootstrapMeanInterval } from "../analytics/experimentSweep";
import type { RimeaTestResult } from "./shared";
import { corridorTest, walkCorridorOnce } from "./test01Corridor";

/**
 * Test 7's population (A 2, p. 31, its Fig. 3): the guideline says to
 * "select, per Fig. 3, a group consisting of adult persons" and then "show
 * that the distribution of walking speeds in the simulation is consistent
 * with the distribution in the table". RiMEA's own English column names
 * "Figure 2" for the first half of that sentence, but Figure 2 (p. 11) is an
 * unrelated diagram of evacuation-time components — grepped for across the
 * whole document to be sure — while the German original says "Abb. 3", the
 * only age-speed curve the guideline has. Read as a translation slip, not a
 * second data source, and Fig. 3 is used throughout.
 *
 * Fig. 3 is a continuous curve, not one group, so a point on it had to be
 * chosen: age 30, a round age inside the plateau that follows the steep
 * 10-20 climb and precedes the post-50 decline — away from the sharp peak
 * near age 20, where a small misreading swings the mean the most. Read off
 * the curve's own gridlines (0.2 m/s squares, 400 DPI render of the source
 * PDF) at age 30: v_mean ~= 1.52 m/s, v_mean+sigma ~= 1.83, v_mean-sigma ~=
 * 1.19 -- half-widths of 0.31 and 0.33, agreeing with each other and with
 * the same half-widths read at age 20 (0.31 and 0.32), so sigma ~= 0.32 m/s
 * from the figure.
 *
 * Table 2 (p. 14) is a different, single-row table -- "persons with impaired
 * mobility", 0.46-0.76 m/s -- that no test in this guideline's Annex 1
 * actually cites by number; it is not an alternative reading of this test.
 *
 * This test reuses the engine's existing per-agent speed spread
 * (`sampleSpeedFactor`, a fixed 0.26/1.34 ~= 19.4% of whichever mean speed a
 * scene declares -- the same mechanism every other test in this file walks
 * through) rather than adding a second, one-off Gaussian sampler: at
 * 1.52 m/s that gives sigma ~= 0.295 m/s, close enough to the figure's 0.32
 * (both round to "about 0.3 m/s" given how imprecise reading a printed
 * curve is) that the gap is disclosed here rather than built around.
 *
 * Each of the 50 is walked alone down test 1's own corridor — a person with
 * nobody nearby is exactly what "free walking speed" means — and their
 * realised speed (length / travel time) stands in for "the distribution of
 * walking speeds in the simulation". Consistency is judged the same way
 * this project's own bootstrap tooling already judges a sweep
 * (`bootstrapMeanInterval`, gap-closure plan 1.3): the figure's mean passes
 * if it falls inside the 95% bootstrap interval of the 50 realised speeds'
 * own mean. The sample's standard deviation is reported alongside it, not
 * gated on — 50 draws estimate a spread too noisily to threshold.
 */
export const demographicSpeedTest = {
  ageYears: 30,
  meanSpeedMetersPerSecond: 1.52,
  figureSigmaMetersPerSecond: 0.32,
  people: 50,
} as const;

/**
 * Test 7: does the distribution of realised free walking speeds over a
 * population of adults match the mean read off the guideline's own Fig. 3?
 */
export function runDemographicSpeedTest(): RimeaTestResult {
  const t = demographicSpeedTest;
  const times = Array.from({ length: t.people }, (_, index) =>
    walkCorridorOnce(index + 1, t.meanSpeedMetersPerSecond),
  ).filter((time): time is number => time !== null);

  if (times.length < 2) {
    return {
      number: 7,
      title: "Allocation of demographic parameters",
      status: "fail",
      measured: `only ${times.length} of ${t.people} reached the end of the corridor`,
      criterion: demographicSpeedCriterion(),
    };
  }

  const speeds = times.map((seconds) => corridorTest.lengthMeters / seconds);
  const mean = speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;
  const variance =
    speeds.reduce((sum, speed) => sum + (speed - mean) ** 2, 0) / (speeds.length - 1);
  const stdDev = Math.sqrt(variance);
  const interval = bootstrapMeanInterval(speeds, { seed: 1 });
  const withinInterval =
    interval !== null &&
    t.meanSpeedMetersPerSecond >= interval.low &&
    t.meanSpeedMetersPerSecond <= interval.high;

  return {
    number: 7,
    title: "Allocation of demographic parameters",
    status: withinInterval ? "pass" : "fail",
    measured: `${speeds.length} realised speeds: mean ${mean.toFixed(3)} m/s, sd ${stdDev.toFixed(3)} m/s; 95% bootstrap interval of the mean ${interval ? `[${interval.low.toFixed(3)}, ${interval.high.toFixed(3)}]` : "unavailable"}`,
    criterion: demographicSpeedCriterion(),
  };
}

function demographicSpeedCriterion() {
  const t = demographicSpeedTest;
  return `RiMEA 4.1.1 A 2 test 7 (p. 31, its Fig. 3): distribute walking speeds over a population of ${t.people} adults per Fig. 3 and show the simulated distribution is consistent with it. Fig. 3 read at age ${t.ageYears} (a round age on its plateau, away from the peak near 20): v_mean ~= ${t.meanSpeedMetersPerSecond} m/s, sigma ~= ${t.figureSigmaMetersPerSecond} m/s (digitised off the guideline's own printed gridlines, not a value it tabulates). Each person walked test 1's corridor alone; the figure's mean passes if it sits inside the 95% bootstrap interval of the ${t.people} realised speeds' own mean.`;
}
