import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import {
  bodyRadiusRangeMeters,
  sampleUniformReactionSeconds,
} from "./behaviorDistributions";
import { bootstrapMeanInterval } from "./experimentSweep";
import { measureCorridorSpeed } from "./fundamentalDiagramHarness";
import { connectorPitchDegrees, connectorSpeeds, flightFloorId } from "./floorRouting";
import { createMallCrowdDecisionBackend } from "./mallCrowdDecisionBackend";
import { createSimulationEngineFromScene } from "./simulationEngine";
import {
  weidmannFundamentalDiagram,
  weidmannSpeedAtDensity,
} from "./pedestrianFundamentalDiagram";

/**
 * RiMEA's verification tests, and how far this engine has been put through
 * them (gap-closure plan 1.2).
 *
 * SOURCE: RiMEA — Richtlinie für Mikroskopische Entfluchtungsanalysen /
 * Guideline for Microscopic Evacuation Analysis, **version 4.1.1 of
 * 11.09.2025**, RiMEA e.V., www.rimea.de, licensed CC BY-ND 4.0. Annex 1
 * ("Provisional instructions for the validation / verification of simulation
 * programs") defines **sixteen** tests across A 2 (components), A 3
 * (functional) and A 4 (qualitative). Page numbers below are that edition's.
 *
 * Only the parameters of each test are recorded here — geometry, densities,
 * time windows — with the clause they come from. The guideline's own text is
 * not reproduced, and the German version is the authoritative one.
 *
 * **Read the status field before the numbers.** RiMEA 3.0 defines fourteen
 * tests, each with its own geometry and acceptance criterion. Only a test
 * whose geometry and criterion have been taken **from the standard's own
 * text** can be said to have been run, and this file is explicit about which
 * those are:
 *
 * - `run` — the geometry and the criterion are recorded here with their
 *   source, the engine was measured against them, and the result is whatever
 *   it is. A failure stays a failure; nothing here is tuned until it passes.
 * - `needs-scenario` — the parameters are recorded, and the scenario that
 *   would exercise them has not been built yet. Each one says what it needs. The scenarios in
 *   `benchmarkScenarios.ts` are named after RiMEA tests but say in their own
 *   header that they are **not** RiMEA geometry; they are regression guards.
 *
 * So this suite is a statement of position, not a certificate. It exists so
 * that "which RiMEA tests does it pass?" has an answer that is checked by
 * code rather than remembered.
 */

export type RimeaStatus = "pass" | "fail" | "needs-scenario";

export type RimeaTestResult = {
  /** RiMEA's own numbering. */
  number: number;
  title: string;
  status: RimeaStatus;
  /** What was measured, when it was. */
  measured?: string;
  /** What it was measured against, and where that came from. */
  criterion?: string;
  /** Why it has not been attempted, for the two "needs" statuses. */
  blockedBy?: string;
};

/**
 * Test 1's corridor and criterion (A 2, p. 29): one person, a 2 m wide and
 * 40 m long corridor, and — with 40 cm of body dimension, 1 s of premovement
 * and 5% of speed treated as imprecise, at a typical 1.33 m/s — a travel time
 * that "should lie in the range of 26 to 34 seconds".
 */
export const corridorTest = {
  lengthMeters: 40,
  widthMeters: 2,
  speedMetersPerSecond: 1.33,
  travelSecondsMin: 26,
  travelSecondsMax: 34,
} as const;

/**
 * How many people are walked through it, one at a time.
 *
 * The guideline says "a person". This engine draws every person's free speed
 * from N(1.34, 0.26) — a **19% spread**, where the criterion's window was
 * built from 5% — so *which* person matters: a single draw says more about the
 * draw than about the model. Twenty of them, one per run, give a median to
 * judge and a spread to report.
 */
export const corridorTestRuns = 20;

function corridorScene(
  seed: number,
  speedMetersPerSecond: number = corridorTest.speedMetersPerSecond,
): CrowdSimScene {
  const y = 3;
  const halfWidth = corridorTest.widthMeters / 2;
  // The exit's radius is 1 m, so its centre sits one metre past the 40 m mark
  // and the walk really is 40 m.
  const exitX = 2 + corridorTest.lengthMeters + 1;

  return parseScene({
    schemaVersion: "1.0.0",
    id: `rimea-test-1-${seed}`,
    name: "RiMEA test 1: corridor",
    seed,
    speedMetersPerSecond,
    world: { width: exitX + 3, height: 6 },
    walls: [
      {
        id: "south",
        geometry: {
          type: "polyline",
          points: [
            { x: 0, y: y - halfWidth },
            { x: exitX + 2, y: y - halfWidth },
          ],
        },
      },
      {
        id: "north",
        geometry: {
          type: "polyline",
          points: [
            { x: 0, y: y + halfWidth },
            { x: exitX + 2, y: y + halfWidth },
          ],
        },
      },
    ],
    entrances: [
      {
        id: "start",
        kind: "source",
        position: { x: 2, y },
        width: corridorTest.widthMeters,
        arrivalRatePerMinute: 120,
        groupShare: 0,
      },
      {
        id: "finish",
        kind: "sink",
        position: { x: exitX, y },
        width: corridorTest.widthMeters,
      },
    ],
  });
}

/** One person's walk down the corridor, in seconds, or null if they never arrive. */
function walkCorridorOnce(
  seed: number,
  speedMetersPerSecond: number = corridorTest.speedMetersPerSecond,
): number | null {
  const engine = createSimulationEngineFromScene(
    corridorScene(seed, speedMetersPerSecond),
    { maxAgents: 1 },
  );
  engine.start();

  let startedAt: number | null = null;

  // Twice the slowest plausible walk, so a stuck person ends the run rather
  // than hanging it.
  for (let step = 0; step < 120 * 60; step += 1) {
    engine.step(1 / 60);
    const snapshot = engine.snapshot();

    if (startedAt === null && snapshot.agents.length > 0) {
      startedAt = snapshot.elapsedSeconds;
    }

    if (snapshot.exitedCount > 0) {
      return startedAt === null ? null : snapshot.elapsedSeconds - startedAt;
    }
  }

  return null;
}

/**
 * Test 1: does one person cover 40 m of corridor in the time the guideline
 * allows?
 *
 * Judged on the **median** of twenty walks, because 1.33 m/s is the
 * guideline's *typical* speed and the median walker is the typical one. The
 * share of walks inside the window is reported beside it, and that share is
 * the interesting number: it shows how much wider this engine's speed spread
 * is than the 5% the window assumes.
 */
export function runCorridorSpeedTest(runs = corridorTestRuns): RimeaTestResult {
  const times = Array.from({ length: runs }, (_, index) =>
    walkCorridorOnce(index + 1),
  ).filter((time): time is number => time !== null);

  if (times.length === 0) {
    return {
      number: 1,
      title: "Maintaining the specified walking speed in a corridor",
      status: "fail",
      measured: "nobody reached the end of the corridor",
      criterion: corridorCriterion(),
    };
  }

  const sorted = [...times].sort((left, right) => left - right);
  const median = sorted[Math.floor(sorted.length / 2)];
  const inside = times.filter(
    (time) =>
      time >= corridorTest.travelSecondsMin && time <= corridorTest.travelSecondsMax,
  ).length;

  return {
    number: 1,
    title: "Maintaining the specified walking speed in a corridor",
    status:
      median >= corridorTest.travelSecondsMin && median <= corridorTest.travelSecondsMax
        ? "pass"
        : "fail",
    measured: `median ${median.toFixed(1)} s over ${times.length} walks (range ${sorted[0].toFixed(1)}-${sorted[sorted.length - 1].toFixed(1)} s); ${inside} of ${times.length} inside the window`,
    criterion: corridorCriterion(),
  };
}

function corridorCriterion() {
  return `RiMEA 4.1.1 A 2 test 1 (p. 29): one person, ${corridorTest.widthMeters} m x ${corridorTest.lengthMeters} m corridor at ${corridorTest.speedMetersPerSecond} m/s, travel time ${corridorTest.travelSecondsMin}-${corridorTest.travelSecondsMax} s. Judged on the median of ${corridorTestRuns} walks: this engine draws free speeds with a 19% spread where the window assumes 5%, so single walks fall outside it by design.`;
}

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

/**
 * Test 5's room (A 2, p. 30): ten people in an 8 m x 5 m room, a 1 m wide
 * exit centred on one of the 5 m walls, premovement times "uniformly
 * distributed between 10 s and 100 s" — not this project's own lognormal
 * (`behaviorDistributions.sampleEvacuationReactionSeconds`), so the decision
 * backend is given `sampleUniformReactionSeconds` instead
 * (`mallCrowdDecisionBackend`'s injectable `evacuationReactionSecondsFor`).
 *
 * Two things had to be true before "verify that each person starts at an
 * appropriate time" was even measurable, and both surfaced only by building
 * this and watching it fail in a way premovement timing could not explain:
 *
 * 1. **Someone waiting was not standing still.** Every agent is spawned
 *    pointing at a sink by default (simulationEngine), and "carry on with
 *    what they were doing" — the evacuation branch's rule for anyone whose
 *    premovement time has not yet passed — has nothing to carry on with for
 *    a person who has never been given a real decision, so they spent their
 *    whole wait visibly walking toward the exit regardless of it. The
 *    decision backend now pins anyone caught with no decision at all to
 *    where they are (`mallCrowdDecisionBackend`'s evacuation branch, the
 *    `state === undefined` case) until their own time comes — one decision,
 *    not repeated, so nothing has to keep refreshing it.
 * 2. **Departure is not the same question as reaction time.** A 1 m door and
 *    ten people is a real bottleneck — Weidmann peak flow puts its
 *    throughput under two people a second — whenever more than a couple of
 *    draws land close together, which a uniform draw over 10-100 s does
 *    often enough with only ten of them. Measuring time-to-actually-leave
 *    would fail this test on the guideline's own geometry regardless of
 *    whether every reaction time was honoured, so what is measured is the
 *    moment each person's decision flips to "evacuate" — starts moving —
 *    not the moment they get out the door.
 */
export const premovementTest = {
  roomWidthMeters: 8,
  roomHeightMeters: 5,
  exitWidthMeters: 1,
  people: 10,
  minReactionSeconds: 10,
  maxReactionSeconds: 100,
} as const;

function premovementScene(seed: number): CrowdSimScene {
  const w = premovementTest.roomWidthMeters;
  const h = premovementTest.roomHeightMeters;
  const exitHalf = premovementTest.exitWidthMeters / 2;

  return parseScene({
    schemaVersion: "1.0.0",
    id: `rimea-test-5-${seed}`,
    name: "RiMEA test 5: premovement time",
    seed,
    speedMetersPerSecond: corridorTest.speedMetersPerSecond,
    world: { width: w + 2, height: h },
    walls: [
      {
        id: "south",
        geometry: {
          type: "polyline",
          points: [
            { x: 0, y: 0 },
            { x: w, y: 0 },
          ],
        },
      },
      {
        id: "north",
        geometry: {
          type: "polyline",
          points: [
            { x: 0, y: h },
            { x: w, y: h },
          ],
        },
      },
      {
        id: "west",
        geometry: {
          type: "polyline",
          points: [
            { x: 0, y: 0 },
            { x: 0, y: h },
          ],
        },
      },
      // The east wall is the 5 m one, and the exit is its middle metre.
      {
        id: "east-lower",
        geometry: {
          type: "polyline",
          points: [
            { x: w, y: 0 },
            { x: w, y: h / 2 - exitHalf },
          ],
        },
      },
      {
        id: "east-upper",
        geometry: {
          type: "polyline",
          points: [
            { x: w, y: h / 2 + exitHalf },
            { x: w, y: h },
          ],
        },
      },
    ],
    entrances: [
      {
        id: "start",
        kind: "source",
        // Well clear of the exit, so nobody starts already at the door.
        position: { x: w / 4, y: h / 2 },
        width: 3,
        // All ten within a few seconds: this test is about when they react,
        // not when they arrive, and evacuationActive is set before any of
        // them do. A Poisson mean of 10 arrivals in one second sometimes
        // draws fewer — spawning is capped by maxAgents, not guaranteed to
        // reach it — and once this window ends nobody else ever arrives, so
        // some seeds spawned as few as four of the ten and the test failed
        // for a reason with nothing to do with premovement. A mean of 30
        // over three seconds makes missing the cap of ten vanishingly
        // unlikely instead of merely likely enough.
        arrivalProfile: { intervalMinutes: 3 / 60, ratesPerMinute: [10 * 60] },
        arrivalRatePerMinute: 0,
        groupShare: 0,
      },
      {
        id: "finish",
        kind: "sink",
        position: { x: w, y: h / 2 },
        width: premovementTest.exitWidthMeters,
      },
    ],
  });
}

/**
 * One run: ten people spawned, the alarm raised before any of them do, and
 * each one's own assigned reaction time set against when they actually
 * started moving.
 */
function walkPremovementOnce(
  seed: number,
): readonly { agentId: number; assigned: number; observed: number }[] {
  const reactionSecondsFor = (agentId: number) =>
    sampleUniformReactionSeconds(
      seed,
      agentId,
      premovementTest.minReactionSeconds,
      premovementTest.maxReactionSeconds,
    );
  const engine = createSimulationEngineFromScene(premovementScene(seed), {
    decisionBackend: createMallCrowdDecisionBackend({
      evacuationReactionSecondsFor: reactionSecondsFor,
      seed,
      shops: [],
    }),
    maxAgents: premovementTest.people,
  });
  engine.start();
  // Raised before anyone spawns, not after the room fills: with no shops
  // declared, a decision backend sends anyone who is not evacuating straight
  // to the nearest exit with no gating at all (the ordinary "leave" state) —
  // in an 8 m room that is a few seconds, not the 10-100 s this test is
  // about. Raising the alarm first means every arrival's very first decision
  // is already gated by their own premovement time.
  engine.setEvacuation(true);

  // What is measured (module doc, point 2): when the decision flips to
  // "evacuate", not when the person is finally out the door.
  const startedMoving = new Map<number, number>();
  for (let step = 0; step < 130 * 60; step++) {
    engine.step(1 / 60);
    const snapshot = engine.snapshot();

    for (const agent of snapshot.agents) {
      if (agent.lifecycleState === "evacuate" && !startedMoving.has(agent.id)) {
        startedMoving.set(agent.id, snapshot.elapsedSeconds);
      }
    }

    if (startedMoving.size >= premovementTest.people) break;
  }

  return Array.from(startedMoving.entries()).map(([agentId, observed]) => ({
    agentId,
    assigned: reactionSecondsFor(agentId),
    observed,
  }));
}

/**
 * How close "starts at an appropriate time" is read to mean, seconds — for
 * when the decision flips to "evacuate" (module doc, point 2), not for
 * getting out the door, which a one-metre width for ten people does not
 * bound this tightly. Self-authored: the guideline states no tolerance.
 * Decisions run at 10 Hz (`decisionHz`), so 0.1 s of lag between crossing the
 * threshold and it being noticed is built in; this leaves a little more room
 * on top for measurement noise, not for someone starting meaningfully early
 * or late.
 */
export const premovementToleranceSeconds = 0.5;

/**
 * Test 5: does each of ten people, given their own uniformly-drawn
 * premovement time, actually start moving at that time?
 */
export function runPremovementTest(seed = 5): RimeaTestResult {
  const results = walkPremovementOnce(seed);
  const criterion = `RiMEA 4.1.1 A 2 test 5 (p. 30): ten people in an ${premovementTest.roomWidthMeters} m x ${premovementTest.roomHeightMeters} m room, a ${premovementTest.exitWidthMeters} m exit centred on the ${premovementTest.roomHeightMeters} m wall, premovement times uniform on ${premovementTest.minReactionSeconds}-${premovementTest.maxReactionSeconds} s (behaviorDistributions.sampleUniformReactionSeconds, not this project's own lognormal). Judged on whether each person starts moving within ${premovementToleranceSeconds} s of their own assigned time — a self-authored tolerance, not a number the guideline gives — measured as the decision to evacuate, not getting out the one-metre door, which ten people's own queueing there would fail regardless of reaction time (module doc).`;

  if (results.length < premovementTest.people) {
    return {
      number: 5,
      title: "Premovement time",
      status: "fail",
      measured: `only ${results.length} of ${premovementTest.people} ever started moving`,
      criterion,
    };
  }

  const worst = results.reduce((worstSoFar, point) =>
    Math.abs(point.observed - point.assigned) >
    Math.abs(worstSoFar.observed - worstSoFar.assigned)
      ? point
      : worstSoFar,
  );
  const worstGap = Math.abs(worst.observed - worst.assigned);

  return {
    number: 5,
    title: "Premovement time",
    status: worstGap <= premovementToleranceSeconds ? "pass" : "fail",
    measured: `worst gap ${worstGap.toFixed(2)} s (agent ${worst.agentId}: assigned ${worst.assigned.toFixed(1)} s, started at ${worst.observed.toFixed(1)} s), over all ${results.length} people`,
    criterion,
  };
}

/**
 * Tests 2 and 3's staircase (A 2, p. 29): "the considerations from test 1
 * apply accordingly with adjusted values for route, duration and speed" — a
 * 2 m wide, 10 m long flight (measured along the slope) at "a defined walking
 * speed". The defined speed used here is this project's own literature stair
 * speed (`floorRouting.connectorSpeeds`), the one every stair in the app
 * defaults to. Unlike test 1's level speed, nobody draws this from a
 * distribution unless a scene declares a population (ADR-0011) — this one
 * does not — so every walk takes the same nominal time, up to discretisation.
 *
 * A 10 m flight at the 30° pitch this project's connectors use
 * (`connectorPitchDegrees`) rises `10 * sin(30°) = 5` m, so the two floors
 * here sit 5 m apart.
 */
export const stairSpeedTest = {
  lengthMeters: 10,
  widthMeters: 2,
  riseMeters: 5,
} as const;

/**
 * How many times each direction is walked. Not for spread — absent a
 * population, `flightSpeedMetersPerSecond` is the same literature constant
 * for everyone, so repeats here check discretisation, not variability.
 */
export const stairSpeedTestRuns = 3;

function stairSpeedScene(direction: "up" | "down", seed: number): CrowdSimScene {
  const boardFloor = direction === "up" ? "lower" : "upper";
  const landFloor = direction === "up" ? "upper" : "lower";

  return parseScene({
    schemaVersion: "1.0.0",
    id: `rimea-test-stair-${direction}-${seed}`,
    name: `RiMEA test ${direction === "up" ? 2 : 3}: stair speed, ${direction}`,
    seed,
    speedMetersPerSecond: corridorTest.speedMetersPerSecond,
    world: { width: 40, height: 20 },
    floors: [
      { id: "lower", level: 0, elevationMeters: 0 },
      { id: "upper", level: 1, elevationMeters: stairSpeedTest.riseMeters },
    ],
    connectors: [
      {
        id: "stair",
        kind: "stair",
        from: { floorId: boardFloor, point: { x: 20, y: 10 } },
        to: { floorId: landFloor, point: { x: 20, y: 10 } },
        width: stairSpeedTest.widthMeters,
        bidirectional: false,
      },
    ],
    entrances: [
      {
        id: "start",
        floorId: boardFloor,
        kind: "source",
        position: { x: 5, y: 10 },
        width: 3,
        arrivalRatePerMinute: 120,
        groupShare: 0,
      },
      {
        id: "finish",
        floorId: landFloor,
        kind: "sink",
        position: { x: 35, y: 10 },
        width: 5,
      },
    ],
  });
}

/**
 * One person's time on the flight itself, in seconds: from boarding (their
 * `floorId` becomes the connector's own flight lane, floorTransfers) to
 * stepping off it, not counting the walk to or from the stair mouth — the
 * same scope test 1's corridor has by construction. Null if they never cross.
 */
function walkStairOnce(direction: "up" | "down", seed: number): number | null {
  const engine = createSimulationEngineFromScene(stairSpeedScene(direction, seed), {
    maxAgents: 1,
  });
  engine.start();

  const laneId = flightFloorId("stair");
  let boardedAt: number | null = null;

  for (let step = 0; step < 120 * 60; step += 1) {
    engine.step(1 / 60);
    const snapshot = engine.snapshot();
    const agent = snapshot.agents[0] as { floorId?: string } | undefined;

    if (boardedAt === null && agent?.floorId === laneId) {
      boardedAt = snapshot.elapsedSeconds;
      continue;
    }

    if (boardedAt !== null && agent?.floorId !== laneId) {
      return snapshot.elapsedSeconds - boardedAt;
    }
  }

  return null;
}

/**
 * The ratio test 1's own published window bears to its own nominal time
 * (40 m / 1.33 m/s = 30.08 s): 26/30.08 = 86.4%, 34/30.08 = 113.0%.
 *
 * This is what tests 2 and 3 actually get from "the considerations of test 1
 * apply... with adjusted values": the guideline states the three tolerances
 * that went into 26-34 s (40 cm body, 1 s premovement, 5% speed) but not the
 * arithmetic that combines them, and reconstructing that arithmetic here did
 * not reproduce 26 s at either extreme of those three tolerances applied to
 * test 1's own numbers. What the text does make reproducible is the
 * **ratio** — so that is what is used, scaled to the stair's own nominal
 * time. **This is this project's own extrapolation, not a value RiMEA
 * states**, and every criterion string built from it says so.
 */
function test1RatioWindow(nominalSeconds: number) {
  const nominalCorridorSeconds =
    corridorTest.lengthMeters / corridorTest.speedMetersPerSecond;
  return {
    low: (corridorTest.travelSecondsMin / nominalCorridorSeconds) * nominalSeconds,
    high: (corridorTest.travelSecondsMax / nominalCorridorSeconds) * nominalSeconds,
  };
}

/**
 * Tests 2 and 3: does one person cross a 10 m, 2 m wide flight at this
 * project's own literature stair speed in about the time that implies?
 */
export function runStairSpeedTest(direction: "up" | "down"): RimeaTestResult {
  const speed =
    direction === "up" ? connectorSpeeds.stairUp : connectorSpeeds.stairDown;
  const nominalSeconds = stairSpeedTest.lengthMeters / speed;
  const window = test1RatioWindow(nominalSeconds);
  const times = Array.from({ length: stairSpeedTestRuns }, (_, index) =>
    walkStairOnce(direction, index + 1),
  ).filter((time): time is number => time !== null);

  const criterion = `RiMEA 4.1.1 A 2 test ${direction === "up" ? 2 : 3} (p. 29): one person, ${stairSpeedTest.widthMeters} m wide, ${stairSpeedTest.lengthMeters} m (along the slope) staircase, defined speed ${speed.toFixed(2)} m/s (this project's own literature stair speed, floorRouting.connectorSpeeds). Window ${window.low.toFixed(1)}-${window.high.toFixed(1)} s is test 1's own published ratio (86.4%-113.0% of nominal) applied to this nominal time — RiMEA does not give a formula precise enough to rederive an absolute number, so this is this project's extrapolation, not stated text.`;

  if (times.length === 0) {
    return {
      number: direction === "up" ? 2 : 3,
      title: `Maintaining the specified walking speed ${direction} stairs`,
      status: "fail",
      measured: "nobody crossed the flight",
      criterion,
    };
  }

  const sorted = [...times].sort((left, right) => left - right);
  const median = sorted[Math.floor(sorted.length / 2)];

  return {
    number: direction === "up" ? 2 : 3,
    title: `Maintaining the specified walking speed ${direction} stairs`,
    status: median >= window.low && median <= window.high ? "pass" : "fail",
    measured: `median ${median.toFixed(2)} s over ${times.length} walks (range ${sorted[0].toFixed(2)}-${sorted[sorted.length - 1].toFixed(2)} s) — no population declared, so this is a discretisation check, not a spread`,
    criterion,
  };
}

/**
 * Test 6's corner (A 2, pp. 30-31, its Figure 6): a corridor 2 m wide that
 * turns left, with arms of 10 m plus the 2 m of the turn itself, and twenty
 * people who "will successfully go around it without passing through walls".
 *
 * Coordinates here: the horizontal arm runs x 0-12 in y 0-2, the vertical arm
 * runs y 0-12 in x 10-12, and the exit is at the top of the vertical arm.
 */
export const cornerTest = {
  armMeters: 10,
  widthMeters: 2,
  people: 20,
  /** The guideline distributes them over a 6 m stretch of the first arm. */
  startStretchMeters: 6,
} as const;

const cornerOuter = cornerTest.armMeters + cornerTest.widthMeters;

/** Whether a point is inside the L, which is the whole of test 6's criterion. */
export function insideCorner(x: number, y: number, toleranceMeters = 0.05): boolean {
  const t = toleranceMeters;
  const inHorizontal =
    x >= -t && x <= cornerOuter + t && y >= -t && y <= cornerTest.widthMeters + t;
  const inVertical =
    x >= cornerTest.armMeters - t &&
    x <= cornerOuter + t &&
    y >= -t &&
    y <= cornerOuter + t;

  return inHorizontal || inVertical;
}

function cornerScene(): CrowdSimScene {
  const w = cornerTest.widthMeters;

  return parseScene({
    schemaVersion: "1.0.0",
    id: "rimea-test-6",
    name: "RiMEA test 6: corner",
    seed: 6,
    speedMetersPerSecond: corridorTest.speedMetersPerSecond,
    world: { width: cornerOuter + 2, height: cornerOuter + 2 },
    walls: [
      // The L's outer edge: along the bottom, then up the far side.
      {
        id: "outer",
        geometry: {
          type: "polyline",
          points: [
            { x: 0, y: 0 },
            { x: cornerOuter, y: 0 },
            { x: cornerOuter, y: cornerOuter },
          ],
        },
      },
      // The inner edge: along the top of the first arm, then up to the exit.
      {
        id: "inner",
        geometry: {
          type: "polyline",
          points: [
            { x: 0, y: w },
            { x: cornerTest.armMeters, y: w },
            { x: cornerTest.armMeters, y: cornerOuter },
          ],
        },
      },
      // The closed end behind the crowd.
      {
        id: "back",
        geometry: {
          type: "polyline",
          points: [
            { x: 0, y: 0 },
            { x: 0, y: w },
          ],
        },
      },
    ],
    entrances: [
      {
        id: "start",
        kind: "source",
        position: { x: cornerTest.startStretchMeters / 2, y: w / 2 },
        width: w,
        // Twenty people over the first ten seconds, then nobody: the test is
        // about a fixed group going round, not a stream. 120 a minute is two a
        // second, comfortably under what the door itself would pass
        // (ADR-0008), so the rate is what sets the number and not the queue.
        arrivalProfile: { intervalMinutes: 10 / 60, ratesPerMinute: [120] },
        arrivalRatePerMinute: 0,
        groupShare: 0,
      },
      {
        id: "finish",
        kind: "sink",
        // At the very top of the arm, not past it: its radius is 1 m, so
        // people are counted out a metre short and never need to step outside
        // the corridor the test is checking.
        position: { x: cornerTest.armMeters + w / 2, y: cornerOuter },
        width: w,
      },
    ],
  });
}

/**
 * Test 6: twenty people round a left-hand corner, through no walls.
 *
 * **A declared departure**: the guideline starts them already standing,
 * uniformly spread over a 6 m stretch. This engine only brings people in
 * through a door, so they enter over the first twelve seconds at the middle of
 * that stretch and the crowd forms there. What the test checks — that they get
 * round and stay inside the corridor — is unaffected.
 */
export function runCornerTest(): RimeaTestResult {
  const engine = createSimulationEngineFromScene(cornerScene(), {
    maxAgents: cornerTest.people,
  });
  engine.start();

  let outside: { x: number; y: number } | null = null;
  let arrived = 0;
  let spawned = 0;

  for (let step = 0; step < 180 * 60; step += 1) {
    engine.step(1 / 60);
    const snapshot = engine.snapshot();
    spawned = snapshot.spawnedCount;
    arrived = snapshot.exitedCount;

    for (const agent of snapshot.agents) {
      if (!insideCorner(agent.x, agent.y)) {
        outside ??= { x: agent.x, y: agent.y };
      }
    }

    if (arrived >= cornerTest.people) {
      break;
    }
  }

  const everyoneRound = arrived >= cornerTest.people;

  return {
    number: 6,
    title: "Movement around a corner",
    status: everyoneRound && !outside ? "pass" : "fail",
    measured: outside
      ? `someone left the corridor at (${outside.x.toFixed(2)}, ${outside.y.toFixed(2)}) — ${arrived} had got round by then`
      : `${arrived} people went round and out; nobody left the corridor (the door let ${spawned} in altogether)`,
    criterion: `RiMEA 4.1.1 A 2 test 6 (pp. 30-31): ${cornerTest.people} people round a left turn in a ${cornerTest.widthMeters} m corridor with ${cornerTest.armMeters} m arms, without passing through walls. They enter through a door over 12 s rather than starting spread over 6 m, which this engine cannot set up.`,
  };
}

/**
 * The densities the guideline asks for, people per square metre
 * (A 2, test 4, p. 30): "0.5 P/m², 1 P/m², 2 P/m², 3 P/m², 4 P/m², 5 P/m² and
 * 6 P/m²".
 */
export const fundamentalDiagramDensities = [0.5, 1, 2, 3, 4, 5, 6] as const;

/**
 * How the measurement is taken (A 2, test 4, p. 30): the average speed over
 * **60 seconds**, with the **first 10 seconds** discarded as a transient.
 */
export const fundamentalDiagramMeasureSeconds = 60;
export const fundamentalDiagramTransientSeconds = 10;

/**
 * **A departure from the guideline's geometry, on purpose.**
 *
 * Test 4 specifies a corridor 1,000 m long and 10 m wide with a 2 x 2 m
 * measuring point at its centre. At the highest density it asks for, that is
 * 10,000 m² × 6 P/m² = **60,000 people** — which this engine cannot step in a
 * browser, and which the test does not need: the quantity measured is a local
 * speed at one point in a stream that has reached equilibrium.
 *
 * So the measurement is taken in a periodic corridor instead
 * (`fundamentalDiagramHarness`): a short length closed into a loop, filled to
 * the same density, with the people near each end mirrored at the other so
 * nobody sees empty space where the loop joins. That is the standard way this
 * curve is measured in the literature, and it is **not** what the guideline
 * says. Any report quoting this number must quote this paragraph with it.
 *
 * 20 m × 4 m is 80 m², so the densest case is 480 people rather than 60,000,
 * and the whole sweep is seconds rather than hours. The width is narrower than
 * the guideline's 10 m: still wide enough for several lanes and for
 * overtaking, which is what the measurement needs, and the narrowing is part
 * of the departure declared above.
 */
export const fundamentalDiagramCorridor = {
  lengthMeters: 20,
  widthMeters: 4,
} as const;

/**
 * How far the model may sit from Weidmann's curve, m/s.
 *
 * **Self-authored.** RiMEA asks that a model reproduce a fundamental diagram;
 * it does not publish this number. 0.10 m/s is taken from this project's own
 * calibration record, where the fit to Weidmann left 0.08 m/s of error and the
 * independent SFPE comparison 0.10 (`docs/calibration/`). It is a threshold
 * for a regression, not a standard.
 */
export const fundamentalDiagramToleranceMetersPerSecond = 0.1;

/**
 * Test 4: does the crowd slow down as it gets denser, the way the published
 * fundamental diagram says?
 *
 * The criterion's *form* is RiMEA's (reproduce the diagram); the curve is
 * Weidmann's as recorded in `pedestrianFundamentalDiagram.ts` with its source,
 * and the tolerance is this project's own (above). The measurement is a
 * periodic corridor filled to each density — `fundamentalDiagramHarness`.
 */
export function runFundamentalDiagramTest(
  options: {
    /**
     * Cut-down settings, for exercising this code path without the full
     * sweep. **A result produced with these is not the test**, and nothing
     * that reports one should use them: the guideline's own densities and
     * timing are the defaults, and the panel uses the defaults.
     */
    densities?: readonly number[];
    measureSeconds?: number;
  } = {},
): RimeaTestResult {
  const densities = options.densities ?? fundamentalDiagramDensities;
  const measureSeconds = options.measureSeconds ?? fundamentalDiagramMeasureSeconds;
  const deviations = densities.map((density) => {
    const measured = measureCorridorSpeed(
      density,
      {},
      {
        lengthMeters: fundamentalDiagramCorridor.lengthMeters,
        measureSeconds,
        seed: 4,
        warmupSeconds: fundamentalDiagramTransientSeconds,
        widthMeters: fundamentalDiagramCorridor.widthMeters,
      },
    );

    return {
      density,
      expected: weidmannSpeedAtDensity(density),
      measured,
    };
  });
  // Weidmann's curve reaches zero at its jam density, so above that it is not
  // a yardstick: every non-zero speed "deviates" from 0 and the worst error
  // would always land on the densest point. The guideline asks for the
  // measurement up to 6 P/m² and sets no threshold of its own, so those points
  // are measured and reported, and judged against nothing.
  const comparable = deviations.filter(
    (point) => point.density < weidmannFundamentalDiagram.jamDensityPerSquareMeter,
  );
  const beyondJam = deviations.filter(
    (point) => point.density >= weidmannFundamentalDiagram.jamDensityPerSquareMeter,
  );
  const worst = comparable.reduce((worstSoFar, point) =>
    Math.abs(point.measured - point.expected) >
    Math.abs(worstSoFar.measured - worstSoFar.expected)
      ? point
      : worstSoFar,
  );
  const worstError = Math.abs(worst.measured - worst.expected);
  const beyond = beyondJam
    .map((point) => `${point.density} P/m² ${point.measured.toFixed(2)} m/s`)
    .join(", ");

  return {
    number: 4,
    title: "Measurement of the fundamental diagram",
    status: worstError <= fundamentalDiagramToleranceMetersPerSecond ? "pass" : "fail",
    measured: `worst deviation ${worstError.toFixed(3)} m/s at ${worst.density} P/m² (model ${worst.measured.toFixed(2)}, Weidmann ${worst.expected.toFixed(2)})${beyond ? `; measured past Weidmann's jam density, not judged: ${beyond}` : ""}`,
    criterion: `RiMEA 4.1.1 A 2 test 4 (p. 29-30): densities ${densities.join(", ")} P/m², ${measureSeconds}s mean after a ${fundamentalDiagramTransientSeconds}s transient. Compared here against Weidmann (v0 ${weidmannFundamentalDiagram.freeFlowSpeedMetersPerSecond} m/s, jam ${weidmannFundamentalDiagram.jamDensityPerSquareMeter} P/m²) within ${fundamentalDiagramToleranceMetersPerSecond} m/s — the guideline sets no threshold, so that tolerance is self-authored, and the corridor is periodic rather than its 1,000 m one.`,
  };
}

/**
 * Test 16's corridor (A 4, p. 47): "the width of one agent, so agents can
 * move freely without being able to overtake" — narrower than test 4's, and
 * measured differently: **1D density, persons per metre of corridor, not per
 * square metre** ("in difference to the two-dimensional scenario, agent
 * density is measured in persons/distance (1/m)").
 *
 * The guideline offers two geometries: a ring (Fig. 21, "the advantage of a
 * ring is the avoidance of geometrical influences… the ring is the starting
 * and measuring area and there is no exit"), or a 200 m straight corridor
 * measured in a zone once it reaches a steady state. This project's existing
 * periodic-corridor harness (test 4's `fundamentalDiagramHarness`) already is
 * a loop with no start, end or exit — straight rather than curved, which by
 * the guideline's own reasoning removes nothing the ring's shape was for.
 * That is reused here rather than built twice.
 */
export const oneDimensionalCorridor = {
  lengthMeters: 20,
  /**
   * Wider than the largest body this project draws (0.2-0.26 m radius,
   * `behaviorDistributions.bodyRadiusRangeMeters`) by less than one more
   * body's width, so two people cannot stand abreast without their bodies
   * overlapping — "cannot overtake" as geometry, not a rule enforced on top.
   */
  widthMeters: 0.6,
} as const;

/**
 * Densities to sweep, people per metre, up to and a little past this
 * corridor's own geometric jam: bodies of radius up to
 * `bodyRadiusRangeMeters[1]` cannot stand in line closer than one diameter
 * apart, so `1 / (2 * 0.26) ≈ 1.92` people/m is where they would already be
 * touching shoulder to shoulder. The points past it are still measured
 * (`jamDensityPerMeter` below), the same treatment test 4 gives Weidmann's.
 */
export const oneDimensionalDensities = [0.5, 1, 1.5, 2, 2.5, 3] as const;

/**
 * This corridor's own geometric jam density, 1D, people/m — see
 * `oneDimensionalDensities`. Self-authored from body size, the way test 4
 * reads Weidmann's own jam density off its published curve.
 */
export const oneDimensionalJamDensityPerMeter = 1 / (2 * bodyRadiusRangeMeters[1]);

/**
 * Test 16: does the crowd slow down as a single-file corridor gets denser,
 * the way any true fundamental diagram must?
 *
 * The guideline's own reference is Fig. 20, a 10%/90% percentile envelope
 * from real tests whose raw data it says to download from RiMEA's own
 * website — not a printed table, and not fetched here. So the only thing
 * judged is a physical necessity, not that chart: speed must not *increase*
 * with density. That is checked only **below this corridor's own geometric
 * jam** (`oneDimensionalJamDensityPerMeter`): past it the model was seen, in
 * building this test, to swing between states seconds apart (0.30, 0.53,
 * 0.37, 0.46 m/s at 2.25-3 people/m on one run) rather than settle — plausibly
 * a real stop-and-go instability single-file crowds are known to show near
 * their own jam density, or a measurement window too short for this
 * geometry's equilibration, or both; nothing here distinguishes those. An
 * arbitrary slack on the comparison would only have hidden which. Those
 * points are still measured and reported, judged against nothing, exactly as
 * test 4 treats its own points past Weidmann's jam density.
 */
export function runOneDimensionalFundamentalDiagramTest(
  options: { densities?: readonly number[]; measureSeconds?: number } = {},
): RimeaTestResult {
  const densities = options.densities ?? oneDimensionalDensities;
  const measureSeconds = options.measureSeconds ?? fundamentalDiagramMeasureSeconds;
  const points = densities.map((density) => ({
    density,
    // 1D density (people/m) at this fixed width, expressed as the area
    // density measureCorridorSpeed expects: people/m ÷ width = people/m².
    speed: measureCorridorSpeed(
      density / oneDimensionalCorridor.widthMeters,
      {},
      {
        lengthMeters: oneDimensionalCorridor.lengthMeters,
        measureSeconds,
        seed: 16,
        warmupSeconds: fundamentalDiagramTransientSeconds,
        widthMeters: oneDimensionalCorridor.widthMeters,
      },
    ),
  }));
  const comparable = points.filter(
    (point) => point.density < oneDimensionalJamDensityPerMeter,
  );
  const beyondJam = points.filter(
    (point) => point.density >= oneDimensionalJamDensityPerMeter,
  );

  let violation: { at: number; from: number; to: number } | null = null;
  for (let i = 1; i < comparable.length; i++) {
    // A little slack for step-to-step measurement noise, not for a real rise.
    if (comparable[i].speed > comparable[i - 1].speed + 0.02) {
      violation ??= {
        at: comparable[i].density,
        from: comparable[i - 1].speed,
        to: comparable[i].speed,
      };
    }
  }
  const beyond = beyondJam
    .map((point) => `${point.density} 1/m ${point.speed.toFixed(2)} m/s`)
    .join(", ");

  return {
    number: 16,
    title: "1D fundamental diagram",
    status: violation ? "fail" : "pass",
    measured: violation
      ? `speed rose from ${violation.from.toFixed(2)} to ${violation.to.toFixed(2)} m/s at ${violation.at} 1/m — a fundamental diagram must not do that`
      : `${comparable.map((point) => `${point.density} 1/m ${point.speed.toFixed(2)} m/s`).join(", ")}${beyond ? `; measured past this corridor's own jam density, not judged: ${beyond}` : ""}`,
    criterion: `RiMEA 4.1.1 A 4 test 16 (p. 47): 1D density (persons/m) against mean speed on a corridor the width of one agent, measured and plotted against Fig. 20's percentile envelope — the guideline gives no numeric threshold of its own, and Fig. 20's raw data is a download from RiMEA's site, not fetched here. Measured on a ${oneDimensionalCorridor.lengthMeters} m periodic loop ${oneDimensionalCorridor.widthMeters} m wide (the guideline's ring, straight rather than curved, reusing test 4's method). Judged only below this corridor's own geometric jam density (${oneDimensionalJamDensityPerMeter.toFixed(2)} 1/m, self-authored from body size) — past it speed does not settle, and is reported unjudged rather than compared against an arbitrary tolerance.`,
  };
}

/**
 * Test 10's corridor (A 4, p. 35, its Fig. 9): a 1 m corridor with twelve
 * rooms along it, six a side, each opening onto the corridor through a
 * 0.9 m door. Rooms 1, 2, 3, 4, 7, 8, 9 and 10 are assigned the main exit
 * (1.2 m, directly above room 3, whose own 1.2 m width lines up with it —
 * so room 3 reads as the passage up to it, not a room beside it); rooms 5,
 * 6, 11 and 12 are assigned the secondary exit at the corridor's east end.
 * 23 people total: two per room except room 3's one.
 *
 * **A declared simplification**: rooms are entrance points along the
 * corridor's south and north edges, not walled enclosures — this project's
 * routing does not need a room's own walls to prove that an assignment is
 * obeyed, and what test 10 checks is exactly that: whether a person leaves
 * by the exit their room was assigned, via `exitIds`
 * (`simulationDecisionBackend.nearestSinkByRoute`), a mechanism this
 * project already had for exactly this (ADR-0008). No evacuation alarm is
 * used — `chooseEvacuationSink` deliberately ignores `exitIds` ("a
 * building's own evacuation plan does not reserve exits per entrance"),
 * which is the right call for a fire but the wrong one for testing an
 * assignment; this test wants the ordinary, assignment-respecting "leave"
 * path, so nobody's exitIds are bypassed here.
 */
export const escapeRouteTest = {
  corridorLengthMeters: 8.7,
  corridorWidthMeters: 1,
  doorWidthMeters: 0.9,
  roomDepthMeters: 5,
  mainExitWidthMeters: 1.2,
  // Left to right: rooms 1-6 (north) and 7-12 (south) share these columns.
  roomWidthsMeters: [1.5, 1.5, 1.2, 1.5, 1.5, 1.5],
  // Rooms 1-12 in order. Only room 3 has one person — the passage up to the
  // main exit, not a room like the rest; room 9, directly below it, is an
  // ordinary two-person room.
  peoplePerRoom: [2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  mainExitRoomNumbers: new Set([1, 2, 3, 4, 7, 8, 9, 10]),
} as const;

/**
 * The corridor and both exits, common to every room's own run — built once
 * per room instead of once for all twelve so each run's `maxAgents` can be
 * that room's own headcount exactly, with no other room's burst competing
 * with it for the same global cap. The assignment mechanism under test
 * (`exitIds`) does not care whether the other eleven rooms are simulated in
 * the same run or not.
 */
function escapeRouteScene(room: number): CrowdSimScene {
  const t = escapeRouteTest;
  const columnLefts: number[] = [0];
  for (const width of t.roomWidthsMeters) {
    columnLefts.push(columnLefts[columnLefts.length - 1] + width);
  }
  const columnCentre = (index: number) =>
    (columnLefts[index] + columnLefts[index + 1]) / 2;
  const corridorY0 = t.roomDepthMeters;
  const corridorY1 = t.roomDepthMeters + t.corridorWidthMeters;
  const mainExitX0 = columnLefts[2];
  const mainExitX1 = columnLefts[3];
  const column = (room - 1) % 6;
  const northRow = room <= 6;
  const exitId = t.mainExitRoomNumbers.has(room) ? "main" : "secondary";

  return parseScene({
    schemaVersion: "1.0.0",
    id: `rimea-test-10-room-${room}`,
    name: `RiMEA test 10: room ${room}`,
    seed: 10,
    speedMetersPerSecond: corridorTest.speedMetersPerSecond,
    world: {
      width: t.corridorLengthMeters + 2,
      height: 2 * t.roomDepthMeters + t.corridorWidthMeters + 2,
    },
    walls: [
      {
        id: "corridor-south",
        geometry: {
          type: "polyline",
          points: [
            { x: 0, y: corridorY0 },
            { x: t.corridorLengthMeters, y: corridorY0 },
          ],
        },
      },
      {
        id: "corridor-north-west",
        geometry: {
          type: "polyline",
          points: [
            { x: 0, y: corridorY1 },
            { x: mainExitX0, y: corridorY1 },
          ],
        },
      },
      {
        id: "corridor-north-east",
        geometry: {
          type: "polyline",
          points: [
            { x: mainExitX1, y: corridorY1 },
            { x: t.corridorLengthMeters, y: corridorY1 },
          ],
        },
      },
    ],
    entrances: [
      {
        id: `room-${room}`,
        kind: "source",
        position: {
          x: columnCentre(column),
          y: northRow ? corridorY1 + t.roomDepthMeters / 2 : corridorY0 / 2,
        },
        width: Math.min(t.doorWidthMeters, t.roomWidthsMeters[column]),
        // Under a second: this room's occupants are already there when the
        // test starts, not arriving through its own door.
        arrivalProfile: { intervalMinutes: 1 / 60, ratesPerMinute: [10 * 60] },
        arrivalRatePerMinute: 0,
        groupShare: 0,
        exitIds: [exitId],
      },
      {
        id: "main",
        kind: "sink",
        position: {
          x: (mainExitX0 + mainExitX1) / 2,
          y: corridorY1 + t.roomDepthMeters,
        },
        width: t.mainExitWidthMeters,
      },
      {
        id: "secondary",
        kind: "sink",
        position: { x: t.corridorLengthMeters, y: (corridorY0 + corridorY1) / 2 },
        width: t.corridorWidthMeters,
      },
    ],
  });
}

/** One room's people, walked out once and checked against their own assignment. */
function walkEscapeRouteRoom(room: number): {
  room: number;
  people: number;
  exited: number;
  wrongExit: boolean;
} {
  const people = escapeRouteTest.peoplePerRoom[room - 1];
  const engine = createSimulationEngineFromScene(escapeRouteScene(room), {
    maxAgents: people,
  });
  engine.start();

  let wrongExit = false;
  let exited = 0;

  for (let step = 0; step < 180 * 60; step++) {
    engine.step(1 / 60);
    const snapshot = engine.snapshot();
    exited = snapshot.exitedCount;

    for (const agent of snapshot.agents) {
      if (
        agent.targetSinkId &&
        agent.exitIds &&
        !agent.exitIds.includes(agent.targetSinkId)
      ) {
        wrongExit = true;
      }
    }

    if (exited >= people) break;
  }

  return { room, people, exited, wrongExit };
}

/**
 * Test 10: does everyone leave by the exit their room was assigned, even
 * where that is not simply the nearest one?
 */
export function runEscapeRouteAllocationTest(): RimeaTestResult {
  const rooms = Array.from({ length: 12 }, (_, index) =>
    walkEscapeRouteRoom(index + 1),
  );
  const short = rooms.filter((room) => room.exited < room.people);
  const misrouted = rooms.filter((room) => room.wrongExit);
  const totalPeople = rooms.reduce((sum, room) => sum + room.people, 0);
  const totalExited = rooms.reduce((sum, room) => sum + room.exited, 0);

  const criterion = `RiMEA 4.1.1 A 4 test 10 (p. 35): a corridor with twelve rooms, 23 people in total, rooms 1/2/3/4/7/8/9/10 assigned the main exit and rooms 5/6/11/12 the secondary exit. All allocated people should go to their corresponding exit. Rooms are entrance points along the corridor rather than walled enclosures — a declared simplification; the assignment mechanism under test (exitIds) does not depend on it. Each room is run against the full corridor on its own, so no room's spawn burst competes with another's for a shared agent cap.`;

  if (short.length > 0 || misrouted.length > 0) {
    return {
      number: 10,
      title: "Allocation of escape routes",
      status: "fail",
      measured: `${totalExited} of ${totalPeople} people got out; ${short.map((r) => `room ${r.room} only ${r.exited}/${r.people}`).join(", ")}${misrouted.length > 0 ? `${short.length > 0 ? "; " : ""}misrouted: room ${misrouted.map((r) => r.room).join(", ")}` : ""}`,
      criterion,
    };
  }

  return {
    number: 10,
    title: "Allocation of escape routes",
    status: "pass",
    measured: `all ${totalPeople} people left, each by their assigned exit`,
    criterion,
  };
}

/**
 * Test 15's three geometries (A 4, p. 45, its Fig. 19): a 20 m wide start
 * area feeding a target, three ways. Straight and long (75.4 m), an L-turn
 * (34 m down, then 30 m across, both legs 20 m wide/tall), and straight and
 * short (44 m). "The right illustration represents the shortest route and
 * the illustration on the left is the longest... in the ideal case, the
 * result of the 'corner' will be in between the two results."
 */
export const largeCornerTest = {
  widthMeters: 20,
  startDepthMeters: 6,
  people: 500,
  straightLongLengthMeters: 75.4,
  straightShortLengthMeters: 44,
  cornerVerticalLengthMeters: 34,
  cornerHorizontalLengthMeters: 30,
} as const;

function straightLargeScene(kind: "long" | "short", people: number): CrowdSimScene {
  const t = largeCornerTest;
  const length =
    t.startDepthMeters +
    (kind === "long" ? t.straightLongLengthMeters : t.straightShortLengthMeters);

  return parseScene({
    schemaVersion: "1.0.0",
    id: `rimea-test-15-${kind}`,
    name: `RiMEA test 15: straight, ${kind}`,
    seed: 15,
    speedMetersPerSecond: corridorTest.speedMetersPerSecond,
    world: { width: t.widthMeters + 2, height: length + 2 },
    walls: [
      {
        id: "west",
        geometry: {
          type: "polyline",
          points: [
            { x: 0, y: 0 },
            { x: 0, y: length },
          ],
        },
      },
      {
        id: "east",
        geometry: {
          type: "polyline",
          points: [
            { x: t.widthMeters, y: 0 },
            { x: t.widthMeters, y: length },
          ],
        },
      },
    ],
    entrances: [
      {
        id: "start",
        kind: "source",
        position: { x: t.widthMeters / 2, y: t.startDepthMeters / 2 },
        width: t.widthMeters,
        arrivalProfile: { intervalMinutes: 1, ratesPerMinute: [people * 1.5] },
        arrivalRatePerMinute: 0,
        groupShare: 0,
      },
      {
        id: "target",
        kind: "sink",
        position: { x: t.widthMeters / 2, y: length },
        width: t.widthMeters,
      },
    ],
  });
}

function cornerLargeScene(people: number): CrowdSimScene {
  const t = largeCornerTest;
  const verticalLength = t.startDepthMeters + t.cornerVerticalLengthMeters;
  const bandTop = verticalLength - t.widthMeters;
  // Everything below is shifted right by the horizontal leg's own length, so
  // the leftmost point (the target) sits at x=0 rather than negative — a
  // world's coordinates never go below (0,0) (`clampPointToWorld`), and a
  // first version of this scene put the horizontal leg at negative x, which
  // silently clamped everyone's movement back to x=0 and stranded them at
  // the turn, never reaching it.
  const shift = t.cornerHorizontalLengthMeters;
  const verticalX0 = shift;
  const verticalX1 = shift + t.widthMeters;

  return parseScene({
    schemaVersion: "1.0.0",
    id: "rimea-test-15-corner",
    name: "RiMEA test 15: corner",
    seed: 15,
    speedMetersPerSecond: corridorTest.speedMetersPerSecond,
    world: {
      width: t.widthMeters + t.cornerHorizontalLengthMeters + 2,
      height: verticalLength + 2,
    },
    walls: [
      // The vertical leg's outer (west) edge — only down to where the turn
      // starts. Past that, x=verticalX0 is the *interior* of the horizontal
      // leg, not a wall.
      {
        id: "vertical-west",
        geometry: {
          type: "polyline",
          points: [
            { x: verticalX0, y: 0 },
            { x: verticalX0, y: bandTop },
          ],
        },
      },
      // The whole L's outer (east) edge — the vertical leg's east side
      // continues past bandTop, since x=verticalX1 stays the east boundary
      // all the way down to the horizontal leg's own south wall.
      {
        id: "east",
        geometry: {
          type: "polyline",
          points: [
            { x: verticalX1, y: 0 },
            { x: verticalX1, y: verticalLength },
          ],
        },
      },
      // The horizontal leg's own inner (north) edge — the notch someone has
      // to walk around. It only covers the part of the horizontal leg that
      // sticks out *past* the vertical leg (x < verticalX0): the region
      // under the vertical leg itself (x in [verticalX0, verticalX1]) is the
      // inside of the turn, open floor, not a wall — a first version of this
      // scene ran this wall all the way to verticalX1 and sealed the corner
      // shut, so nobody could ever leave the vertical leg.
      {
        id: "horizontal-north",
        geometry: {
          type: "polyline",
          points: [
            { x: verticalX0, y: bandTop },
            { x: 0, y: bandTop },
          ],
        },
      },
      // The whole L's outer (south) edge, spanning both legs' width — the
      // one boundary that really does run the full x range, unlike the
      // west edge above.
      {
        id: "south",
        geometry: {
          type: "polyline",
          points: [
            { x: verticalX1, y: verticalLength },
            { x: 0, y: verticalLength },
          ],
        },
      },
    ],
    entrances: [
      {
        id: "start",
        kind: "source",
        position: { x: (verticalX0 + verticalX1) / 2, y: t.startDepthMeters / 2 },
        width: t.widthMeters,
        arrivalProfile: { intervalMinutes: 1, ratesPerMinute: [people * 1.5] },
        arrivalRatePerMinute: 0,
        groupShare: 0,
      },
      {
        id: "target",
        kind: "sink",
        position: { x: 0, y: (bandTop + verticalLength) / 2 },
        width: t.widthMeters,
      },
    ],
  });
}

/** How long it takes `people` to clear a scene's start area, seconds. */
function walkLargeGroupOnce(scene: CrowdSimScene, people: number): number {
  const engine = createSimulationEngineFromScene(scene, {
    maxAgents: people,
  });
  engine.start();

  for (let step = 0; step < 900 * 60; step++) {
    engine.step(1 / 60);
    const snapshot = engine.snapshot();
    if (snapshot.exitedCount >= people) {
      return snapshot.elapsedSeconds;
    }
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * Test 15: does a corner's evacuation time fall between the two straight
 * routes it is bracketed by?
 *
 * `people` defaults to the guideline's own 500; a result produced with
 * fewer is not the test, only a walk of the same code path (test 4's own
 * precedent).
 */
export function runLargeCornerTest(options: { people?: number } = {}): RimeaTestResult {
  const people = options.people ?? largeCornerTest.people;
  const shortTime = walkLargeGroupOnce(straightLargeScene("short", people), people);
  const cornerTime = walkLargeGroupOnce(cornerLargeScene(people), people);
  const longTime = walkLargeGroupOnce(straightLargeScene("long", people), people);
  const inBetween = shortTime <= cornerTime && cornerTime <= longTime;

  return {
    number: 15,
    title: "Movement of a large crowd of pedestrians around a corner",
    status: inBetween ? "pass" : "fail",
    measured: `short straight (44 m) ${shortTime.toFixed(1)} s, corner ${cornerTime.toFixed(1)} s, long straight (75.4 m) ${longTime.toFixed(1)} s`,
    criterion: `RiMEA 4.1.1 A 4 test 15 (p. 45, its Fig. 19): ${people} people, 20 m wide, from a start area to a target by three routes — straight 75.4 m (longest), an L-turn (34 m then 30 m), straight 44 m (shortest). "In the ideal case, the result of the 'corner' will be in between the two results for the shortest and longest straight-line route" — the time to clear is what is compared here.`,
  };
}

/**
 * Test 12's shared shape (A 4, pp. 37-41, its Figs. 11/13/14): a 10 m x 10 m
 * room of 150 agents, opening through a bottleneck into open space with a
 * goal beyond it. Four sub-tests vary one thing each — goal distance (12a),
 * bottleneck length (12b), a second bottleneck in series (12c), bottleneck
 * width (12d) — and are reported together as one RiMEA test, since the
 * guideline numbers them that way.
 *
 * Room 1 and the bottleneck are walled; the space after the bottleneck is
 * not — nothing there constrains anyone, so its shape does not change what
 * is being measured (how long room 1 takes to clear through the bottleneck
 * in front of it). Figures 11/13/14 do draw room 2 as walled, which this
 * departs from; declared here rather than in each sub-test.
 *
 * **The bottleneck's width could not be built at the guideline's own
 * number.** This project's routing grid never goes finer than 1 m
 * (`routeCellSizeMeters`), and a wall segment marks every cell it touches;
 * two segments bounding a gap at or near that size can between them mark
 * both of the gap's own cells, sealing it regardless of where it sits.
 * Verified directly on this exact shape: bottleneck widths 0.8, 1.0 and
 * 1.2 m — the guideline's own three values, used for test 12d — let
 * nobody through at all, for the full length of a 60 s check; 1.4-1.8 m
 * were the same; 2.0 m was the first that worked. So `defaultBottleneckWidthMeters`
 * below is 2.4 m, not the guideline's 1 m, in every sub-test — including
 * 12a-c, where width is held constant and is not what is being measured,
 * and 12d, where it is: 12d's own widths are moved out to 2.0-3.2 m, still
 * three points testing the same claim (flow rises with width) but not at
 * the values RiMEA asks for. This is a limit of this project's router, not
 * a choice about the physics, and nothing here claims otherwise.
 */
export const bottleneckTest = {
  room1SizeMeters: 10,
  people: 150,
  defaultBottleneckWidthMeters: 2.4,
  shortBottleneckLengthMeters: 0.2,
  longBottleneckLengthMeters: 5,
  fixedGoalDistanceMeters: 10,
} as const;

/**
 * Room 1's outer walls, common to every test 12 sub-scene (12a/b/c/d all
 * start from the same room) — everything but the door gap in the middle of
 * its east wall, whose width each sub-scene sets for itself.
 */
function room1PerimeterWalls(halfWidth: number) {
  const size = bottleneckTest.room1SizeMeters;
  const midY = size / 2;
  return [
    {
      id: "north",
      geometry: {
        type: "polyline" as const,
        points: [
          { x: 0, y: 0 },
          { x: size, y: 0 },
        ],
      },
    },
    {
      id: "south",
      geometry: {
        type: "polyline" as const,
        points: [
          { x: 0, y: size },
          { x: size, y: size },
        ],
      },
    },
    {
      id: "west",
      geometry: {
        type: "polyline" as const,
        points: [
          { x: 0, y: 0 },
          { x: 0, y: size },
        ],
      },
    },
    {
      id: "east-north",
      geometry: {
        type: "polyline" as const,
        points: [
          { x: size, y: 0 },
          { x: size, y: midY - halfWidth },
        ],
      },
    },
    {
      id: "east-south",
      geometry: {
        type: "polyline" as const,
        points: [
          { x: size, y: midY + halfWidth },
          { x: size, y: size },
        ],
      },
    },
  ];
}

function bottleneckScene(options: {
  id: string;
  bottleneckWidthMeters: number;
  bottleneckLengthMeters: number;
  goalDistanceMeters: number;
  people: number;
}): CrowdSimScene {
  const size = bottleneckTest.room1SizeMeters;
  const midY = size / 2;
  const halfWidth = options.bottleneckWidthMeters / 2;
  const bottleneckX0 = size;
  const bottleneckX1 = size + options.bottleneckLengthMeters;
  const goalX = bottleneckX1 + options.goalDistanceMeters;

  return parseScene({
    schemaVersion: "1.0.0",
    id: options.id,
    name: `RiMEA test 12: ${options.id}`,
    seed: 12,
    speedMetersPerSecond: corridorTest.speedMetersPerSecond,
    world: { width: goalX + 2, height: size + 2 },
    walls: [
      ...room1PerimeterWalls(halfWidth),
      ...(options.bottleneckLengthMeters > 0
        ? [
            {
              id: "bottleneck-north",
              geometry: {
                type: "polyline" as const,
                points: [
                  { x: bottleneckX0, y: midY - halfWidth },
                  { x: bottleneckX1, y: midY - halfWidth },
                ],
              },
            },
            {
              id: "bottleneck-south",
              geometry: {
                type: "polyline" as const,
                points: [
                  { x: bottleneckX0, y: midY + halfWidth },
                  { x: bottleneckX1, y: midY + halfWidth },
                ],
              },
            },
          ]
        : []),
    ],
    entrances: [
      {
        id: "start",
        kind: "source",
        position: { x: size / 2, y: midY },
        width: size,
        arrivalProfile: {
          intervalMinutes: 1,
          ratesPerMinute: [options.people * 1.5],
        },
        arrivalRatePerMinute: 0,
        groupShare: 0,
      },
      {
        id: "goal",
        kind: "sink",
        position: { x: goalX, y: midY },
        width: Math.max(2, options.bottleneckWidthMeters),
      },
    ],
  });
}

/** How long room 1's people take to reach the goal beyond the bottleneck. */
function walkBottleneckOnce(options: {
  id: string;
  bottleneckWidthMeters: number;
  bottleneckLengthMeters: number;
  goalDistanceMeters: number;
  people: number;
}): number {
  const engine = createSimulationEngineFromScene(bottleneckScene(options), {
    maxAgents: options.people,
  });
  engine.start();

  for (let step = 0; step < 600 * 60; step++) {
    engine.step(1 / 60);
    const snapshot = engine.snapshot();
    if (snapshot.exitedCount >= options.people) {
      return snapshot.elapsedSeconds;
    }
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * 12c's own shape (A 4, p. 40, its Fig. 14): three rooms in series, joined
 * by two identical bottlenecks, 150 agents starting in room 1. RiMEA asks
 * only that the time course of room occupancy and bottleneck flow be
 * determined — there is no comparison to pass or fail, so what is reported
 * is room 2's peak simultaneous occupancy (people arrive through bottleneck
 * 1 faster than bottleneck 2, of the same width, can pass them on) and how
 * long room 1 takes to empty.
 */
function congestionScene(people: number): CrowdSimScene {
  const size = bottleneckTest.room1SizeMeters;
  const midY = size / 2;
  const halfWidth = bottleneckTest.defaultBottleneckWidthMeters / 2;
  const bl = bottleneckTest.shortBottleneckLengthMeters;
  const room2Depth = 10;
  const room3Depth = 5;
  const b1x0 = size;
  const b1x1 = b1x0 + bl;
  const b2x0 = b1x1 + room2Depth;
  const b2x1 = b2x0 + bl;
  const goalX = b2x1 + room3Depth;

  const doorGap = (x0: number, x1: number, idPrefix: string) => [
    {
      id: `${idPrefix}-north`,
      geometry: {
        type: "polyline" as const,
        points: [
          { x: x0, y: midY - halfWidth },
          { x: x1, y: midY - halfWidth },
        ],
      },
    },
    {
      id: `${idPrefix}-south`,
      geometry: {
        type: "polyline" as const,
        points: [
          { x: x0, y: midY + halfWidth },
          { x: x1, y: midY + halfWidth },
        ],
      },
    },
  ];

  return parseScene({
    schemaVersion: "1.0.0",
    id: "rimea-test-12c",
    name: "RiMEA test 12c: congestion between two bottlenecks",
    seed: 12,
    speedMetersPerSecond: corridorTest.speedMetersPerSecond,
    world: { width: goalX + 2, height: size + 2 },
    walls: [
      ...room1PerimeterWalls(halfWidth),
      ...doorGap(b1x0, b1x1, "bottleneck-1"),
      ...doorGap(b2x0, b2x1, "bottleneck-2"),
    ],
    entrances: [
      {
        id: "start",
        kind: "source",
        position: { x: size / 2, y: midY },
        width: size,
        arrivalProfile: {
          intervalMinutes: 1,
          ratesPerMinute: [people * 1.5],
        },
        arrivalRatePerMinute: 0,
        groupShare: 0,
      },
      {
        id: "goal",
        kind: "sink",
        position: { x: goalX, y: midY },
        width: 2,
      },
    ],
  });
}

/** Room 1's clear time, and room 2's peak occupancy, for 12c. */
function walkCongestionOnce(people: number): {
  room1ClearSeconds: number;
  room2PeakOccupancy: number;
} {
  const size = bottleneckTest.room1SizeMeters;
  const bl = bottleneckTest.shortBottleneckLengthMeters;
  const room2Depth = 10;
  const room2X0 = size + bl;
  const room2X1 = room2X0 + room2Depth;
  const engine = createSimulationEngineFromScene(congestionScene(people), {
    maxAgents: people,
  });
  engine.start();

  let room1ClearSeconds = Number.POSITIVE_INFINITY;
  let room2PeakOccupancy = 0;

  for (let step = 0; step < 600 * 60; step++) {
    engine.step(1 / 60);
    const snapshot = engine.snapshot();
    const inRoom1 = snapshot.agents.filter((agent) => agent.x < size).length;
    const inRoom2 = snapshot.agents.filter(
      (agent) => agent.x >= room2X0 && agent.x < room2X1,
    ).length;
    room2PeakOccupancy = Math.max(room2PeakOccupancy, inRoom2);
    if (inRoom1 === 0 && room1ClearSeconds === Number.POSITIVE_INFINITY) {
      room1ClearSeconds = snapshot.elapsedSeconds;
    }
    if (snapshot.exitedCount >= people) break;
  }

  return { room1ClearSeconds, room2PeakOccupancy };
}

/**
 * Test 12: do the four things the guideline predicts about bottlenecks
 * actually happen in this engine?
 *
 * - 12a: evacuation time should rise as the goal moves further from the
 *   bottleneck (checked here as non-decreasing across 0, 5 and 10 m — the
 *   guideline also says it should level off, which three points do not
 *   independently confirm beyond that).
 * - 12b: a 5 m bottleneck should take room 1 longer to clear than a 0.2 m
 *   one of the same width.
 * - 12c: measured and reported — the guideline gives no comparison for it,
 *   only "determine the time course", so there is nothing here to fail.
 * - 12d: evacuation time should fall as the bottleneck widens — at 2.0, 2.6
 *   and 3.2 m, not the guideline's 0.8/1.0/1.2 (module doc: those do not
 *   route on this project's grid at all).
 */
/**
 * `people` defaults to the guideline's own 150 for each sub-test; a result
 * produced with fewer is not the test, only a walk of the same code path
 * (test 4's own precedent).
 */
export function runBottleneckTest(options: { people?: number } = {}): RimeaTestResult {
  const people = options.people ?? bottleneckTest.people;
  const goalDistances = [0, 5, 10];
  const aTimes = goalDistances.map((goalDistanceMeters) =>
    walkBottleneckOnce({
      id: `rimea-test-12a-${goalDistanceMeters}`,
      bottleneckWidthMeters: bottleneckTest.defaultBottleneckWidthMeters,
      bottleneckLengthMeters: bottleneckTest.shortBottleneckLengthMeters,
      goalDistanceMeters,
      people,
    }),
  );
  const aMonotonic = aTimes.every(
    (time, index) => index === 0 || time >= aTimes[index - 1],
  );

  const bShort = walkBottleneckOnce({
    id: "rimea-test-12b-short",
    bottleneckWidthMeters: bottleneckTest.defaultBottleneckWidthMeters,
    bottleneckLengthMeters: bottleneckTest.shortBottleneckLengthMeters,
    goalDistanceMeters: bottleneckTest.fixedGoalDistanceMeters,
    people,
  });
  const bLong = walkBottleneckOnce({
    id: "rimea-test-12b-long",
    bottleneckWidthMeters: bottleneckTest.defaultBottleneckWidthMeters,
    bottleneckLengthMeters: bottleneckTest.longBottleneckLengthMeters,
    goalDistanceMeters: bottleneckTest.fixedGoalDistanceMeters,
    people,
  });
  const bLongerIsSlower = bLong >= bShort;

  // Not the guideline's own 0.8/1.0/1.2 m — see the module doc's account of
  // why (this project's router cannot resolve a gap that narrow).
  const widths = [2.0, 2.6, 3.2];
  const dTimes = widths.map((bottleneckWidthMeters) =>
    walkBottleneckOnce({
      id: `rimea-test-12d-${bottleneckWidthMeters.toFixed(1).replace(".", "p")}`,
      bottleneckWidthMeters,
      bottleneckLengthMeters: bottleneckTest.shortBottleneckLengthMeters,
      goalDistanceMeters: bottleneckTest.fixedGoalDistanceMeters,
      people,
    }),
  );
  const dMonotonic = dTimes.every(
    (time, index) => index === 0 || time <= dTimes[index - 1],
  );

  const congestion = walkCongestionOnce(people);

  const pass = aMonotonic && bLongerIsSlower && dMonotonic;

  return {
    number: 12,
    title: "Effect of bottlenecks",
    status: pass ? "pass" : "fail",
    measured: `12a (goal distance 0/5/10 m): ${aTimes.map((t) => t.toFixed(1)).join("/")} s, non-decreasing: ${aMonotonic}. 12b (bottleneck 0.2 m vs 5 m, both ${bottleneckTest.defaultBottleneckWidthMeters} m wide): ${bShort.toFixed(1)} vs ${bLong.toFixed(1)} s, longer is slower: ${bLongerIsSlower}. 12c: room 1 cleared in ${congestion.room1ClearSeconds.toFixed(1)} s, room 2's peak simultaneous occupancy was ${congestion.room2PeakOccupancy} (of ${people}) — not compared, no criterion given. 12d (width ${widths.join("/")} m, not the guideline's 0.8/1.0/1.2 — see criterion): ${dTimes.map((t) => t.toFixed(1)).join("/")} s, non-increasing: ${dMonotonic}.`,
    criterion: `RiMEA 4.1.1 A 4 test 12 (pp. 37-41): four sub-tests on a 10 m x 10 m room of ${people} agents through a bottleneck. 12a: time should increase with goal distance until it reaches a constant value. 12b: time should be larger for a longer bottleneck. 12c: no comparison is asked for, only the time course of agent counts and flow. 12d: flow should increase with bottleneck width (read here as evacuation time decreasing), at the guideline's own 0.8/1.0/1.2 m. None of those widths route on this project's grid (verified: nobody gets through at 0.8-1.8 m; see the module doc), so every sub-test here uses a wider bottleneck (${bottleneckTest.defaultBottleneckWidthMeters} m, or 12d's own ${widths.join("/")} m) — a limit of this project's router, not a choice about the physics. The open space after the bottleneck is unwalled here, unlike the guideline's own figures — a further declared departure that does not change what is measured.`,
  };
}

/**
 * Test 9's room (A 4, p. 34, its Fig. 8): a 20 m x 20 m public space, 1,000
 * people evenly distributed, four 1 m doors, two on the north wall and two
 * on the south, each 2 m in from its own corner. Immediate reaction (a
 * population with response time 0, so `evacuationReactionSecondsFor` is
 * given `() => 0` rather than this project's own lognormal).
 *
 * Step 1 measures the time for the last person to leave with all four
 * doors open; step 2 locks two of them (here, both on the north wall) and
 * repeats. RiMEA's own footnote to this test says the expected "roughly
 * double" is not to be read as a pass/fail bound — the larger crowd
 * queuing at the remaining doors could itself raise the flow through them,
 * "so test 9 should not be treated as an exclusion criterion, but should
 * rather only document model behaviour" — so this reports the ratio
 * without judging it, and passes as long as the room actually clears both
 * times.
 */
export const largeRoomTest = {
  roomSizeMeters: 20,
  doorWidthMeters: 1,
  doorOffsetMeters: 2,
  people: 1000,
} as const;

/**
 * The wall's own opening at each door, wider than `doorWidthMeters` — a
 * router workaround, not a claim about the door. This project's routing
 * grid never goes finer than 1 m (`routeCellSizeMeters`), and a wall
 * segment marks every cell it so much as touches; two segments bounding a
 * ~1 m gap can between them mark both of the gap's own cells, sealing it
 * regardless of where exactly it sits. Verified directly: a 1 m gap on this
 * grid let nobody through in a 60 s check; 2.4 m did. Sinks are not
 * throughput-gated in this engine (only sources are — ADR-0008), so
 * widening the wall opening changes nothing being measured here; it only
 * gives the router a cell it can find.
 */
const routingGapMeters = 2.4;

function largeRoomScene(
  doorNumbers: readonly (1 | 2 | 3 | 4)[],
  people: number,
): CrowdSimScene {
  const t = largeRoomTest;
  const size = t.roomSizeMeters;
  const half = routingGapMeters / 2;
  // A world's coordinates never go below (0,0) (`clampPointToWorld`), so the
  // room is set back from the edge by this much to leave room for a sink
  // just outside each door — a first version put those sinks at negative y,
  // which silently clamped anyone heading there back to y=0 and stranded
  // them at the door instead of ever letting them leave.
  const margin = 2;
  const doorX: Record<1 | 2 | 3 | 4, number> = {
    1: margin + t.doorOffsetMeters,
    2: margin + size - t.doorOffsetMeters,
    3: margin + t.doorOffsetMeters,
    4: margin + size - t.doorOffsetMeters,
  };

  // A wall along `y`, with a gap at each open door's own x.
  function wallWithGaps(
    y: number,
    doors: readonly (1 | 2 | 3 | 4)[],
    idPrefix: string,
  ) {
    const gaps = doors.map((door) => doorX[door]).sort((a, b) => a - b);
    const segments: Array<{
      id: string;
      geometry: { type: "polyline"; points: { x: number; y: number }[] };
    }> = [];
    let cursor = margin;
    gaps.forEach((x, index) => {
      const gapStart = x - half;
      if (gapStart > cursor) {
        segments.push({
          id: `${idPrefix}-${index}`,
          geometry: {
            type: "polyline",
            points: [
              { x: cursor, y },
              { x: gapStart, y },
            ],
          },
        });
      }
      cursor = x + half;
    });
    if (cursor < margin + size) {
      segments.push({
        id: `${idPrefix}-end`,
        geometry: {
          type: "polyline",
          points: [
            { x: cursor, y },
            { x: margin + size, y },
          ],
        },
      });
    }
    return segments;
  }

  const northDoors = doorNumbers.filter((door) => door === 1 || door === 2) as (
    | 1
    | 2
  )[];
  const southDoors = doorNumbers.filter((door) => door === 3 || door === 4) as (
    | 3
    | 4
  )[];

  return parseScene({
    schemaVersion: "1.0.0",
    id: `rimea-test-9-${doorNumbers.join("")}`,
    name: `RiMEA test 9: doors ${doorNumbers.join(",")}`,
    seed: 9,
    speedMetersPerSecond: corridorTest.speedMetersPerSecond,
    world: { width: size + 2 * margin, height: size + 2 * margin },
    walls: [
      {
        id: "west",
        geometry: {
          type: "polyline",
          points: [
            { x: margin, y: margin },
            { x: margin, y: margin + size },
          ],
        },
      },
      {
        id: "east",
        geometry: {
          type: "polyline",
          points: [
            { x: margin + size, y: margin },
            { x: margin + size, y: margin + size },
          ],
        },
      },
      ...wallWithGaps(margin, northDoors, "north"),
      ...wallWithGaps(margin + size, southDoors, "south"),
    ],
    entrances: [
      {
        id: "occupants",
        kind: "source",
        position: { x: margin + size / 2, y: margin + size / 2 },
        width: size,
        arrivalProfile: {
          intervalMinutes: 1,
          ratesPerMinute: [people * 1.5],
        },
        arrivalRatePerMinute: 0,
        groupShare: 0,
      },
      ...doorNumbers.map((door) => ({
        id: `door-${door}`,
        kind: "sink" as const,
        position: {
          x: doorX[door],
          y: door === 1 || door === 2 ? margin / 2 : margin + size + margin / 2,
        },
        width: t.doorWidthMeters,
      })),
    ],
  });
}

/** Seconds for `people` to clear the room through whichever doors are open. */
function walkLargeRoomOnce(
  doorNumbers: readonly (1 | 2 | 3 | 4)[],
  people: number,
): number {
  const engine = createSimulationEngineFromScene(largeRoomScene(doorNumbers, people), {
    decisionBackend: createMallCrowdDecisionBackend({
      evacuationReactionSecondsFor: () => 0,
      seed: 9,
      shops: [],
    }),
    maxAgents: people,
  });
  engine.start();
  engine.setEvacuation(true);

  for (let step = 0; step < 1800 * 60; step++) {
    engine.step(1 / 60);
    const snapshot = engine.snapshot();
    if (snapshot.exitedCount >= people) {
      return snapshot.elapsedSeconds;
    }
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * Test 9: does the room clear through four doors, and again — more slowly,
 * but not judged by how much — through two?
 *
 * `people` defaults to the guideline's own 1,000; a result produced with
 * fewer is not the test, only a walk of the same code path — see test 4's
 * own `options` for the precedent.
 */
export function runLargePublicSpaceTest(
  options: { people?: number } = {},
): RimeaTestResult {
  const people = options.people ?? largeRoomTest.people;
  const fourDoors = walkLargeRoomOnce([1, 2, 3, 4], people);
  const twoDoors = walkLargeRoomOnce([3, 4], people);
  const bothCleared = Number.isFinite(fourDoors) && Number.isFinite(twoDoors);

  return {
    number: 9,
    title: "Crowd of people leaving a large public space",
    status: bothCleared ? "pass" : "fail",
    measured: bothCleared
      ? `four doors ${fourDoors.toFixed(1)} s, two doors (1 and 2 locked) ${twoDoors.toFixed(1)} s, ratio ${(twoDoors / fourDoors).toFixed(2)}x (the guideline's own footnote says roughly 2x is not a pass/fail bound)`
      : `did not clear: four doors ${Number.isFinite(fourDoors) ? `${fourDoors.toFixed(1)} s` : "never"}, two doors ${Number.isFinite(twoDoors) ? `${twoDoors.toFixed(1)} s` : "never"}`,
    criterion: `RiMEA 4.1.1 A 4 test 9 (p. 34, its Fig. 8): a 20 m x 20 m space, ${people} people, four 1 m doors, immediate reaction. Step 1: time for the last person to leave. Step 2: repeat with two doors locked. "The expected result is that it takes approximately twice as long" — but the guideline's own footnote says this should not be treated as an exclusion criterion, since a larger crowd queuing at the remaining doors may itself raise their flow; only that the room clears both times is judged here, and the ratio is reported, not scored. The doors' own routing gaps are ${routingGapMeters} m wide, not the guideline's 1 m — this project's routing grid cannot resolve a gap that size (see largeRoomTest's own comment); door width is not what this test measures, so the substitution does not change what is judged.`,
  };
}

/**
 * Test 11's room (A 4, p. 36, its Fig. 10): a public space occupied from
 * the left at the maximum possible density, with two exits on the far
 * side — exit 1 nearer, exit 2 further on. Immediate reaction (as test 9,
 * `evacuationReactionSecondsFor: () => 0`), and the ordinary evacuation
 * exit choice (`chooseEvacuationSink`, nearest exit penalised by how many
 * are already committed to it — ADR-0008's rule, not `exitIds`, since this
 * test is about which exit people *choose*, not which they are assigned).
 *
 * "The expected result is that the persons prefer the closer exit 1 and
 * congestion occurs in this area. However, individual persons will also
 * use the alternative exit 2." Both parts are checked: exit 1 gets the
 * majority, and exit 2 gets some.
 */
export const twoExitChoiceTest = {
  roomWidthMeters: 30,
  roomHeightMeters: 20,
  people: 1000,
  nearExitXMeters: 22,
  farExitXMeters: 28,
  exitWidthMeters: 1,
} as const;

function twoExitChoiceScene(people: number): CrowdSimScene {
  const t = twoExitChoiceTest;
  // A world's coordinates never go below (0,0) (`clampPointToWorld`), so the
  // room is set back from the top by this much to leave room for the two
  // exit sinks just outside its north wall — a first version put those
  // sinks at negative y, which silently clamped everyone heading there back
  // to y=0 and stranded them at the door.
  const margin = 2;
  const northY = margin;
  const southY = margin + t.roomHeightMeters;

  return parseScene({
    schemaVersion: "1.0.0",
    id: "rimea-test-11",
    name: "RiMEA test 11: choice of escape route",
    seed: 11,
    speedMetersPerSecond: corridorTest.speedMetersPerSecond,
    world: { width: t.roomWidthMeters + 2, height: t.roomHeightMeters + 2 * margin },
    walls: [
      {
        id: "west",
        geometry: {
          type: "polyline",
          points: [
            { x: 0, y: northY },
            { x: 0, y: southY },
          ],
        },
      },
      {
        id: "south",
        geometry: {
          type: "polyline",
          points: [
            { x: 0, y: southY },
            { x: t.roomWidthMeters, y: southY },
          ],
        },
      },
      {
        id: "east",
        geometry: {
          type: "polyline",
          points: [
            { x: t.roomWidthMeters, y: southY },
            { x: t.roomWidthMeters, y: northY },
          ],
        },
      },
      {
        id: "north-west",
        geometry: {
          type: "polyline",
          points: [
            { x: 0, y: northY },
            { x: t.nearExitXMeters - routingGapMeters / 2, y: northY },
          ],
        },
      },
      {
        id: "north-middle",
        geometry: {
          type: "polyline",
          points: [
            { x: t.nearExitXMeters + routingGapMeters / 2, y: northY },
            { x: t.farExitXMeters - routingGapMeters / 2, y: northY },
          ],
        },
      },
      {
        id: "north-east",
        geometry: {
          type: "polyline",
          points: [
            { x: t.farExitXMeters + routingGapMeters / 2, y: northY },
            { x: t.roomWidthMeters, y: northY },
          ],
        },
      },
    ],
    entrances: [
      {
        id: "occupants",
        kind: "source",
        // Occupied "from the left": the crowd starts against the west wall,
        // not spread across the whole room.
        position: { x: t.roomWidthMeters / 4, y: (northY + southY) / 2 },
        width: t.roomHeightMeters - 2,
        arrivalProfile: {
          intervalMinutes: 1,
          ratesPerMinute: [people * 1.5],
        },
        arrivalRatePerMinute: 0,
        groupShare: 0,
      },
      {
        id: "exit-1",
        kind: "sink",
        position: { x: t.nearExitXMeters, y: northY - margin / 2 },
        width: t.exitWidthMeters,
      },
      {
        id: "exit-2",
        kind: "sink",
        position: { x: t.farExitXMeters, y: northY - margin / 2 },
        width: t.exitWidthMeters,
      },
    ],
  });
}

/**
 * Test 11: is the nearer exit preferred, but the farther one still used by
 * some?
 *
 * `people` defaults to the guideline's own 1,000; a result produced with
 * fewer is not the test, only a walk of the same code path (test 4's own
 * precedent).
 */
export function runTwoExitChoiceTest(
  options: { people?: number } = {},
): RimeaTestResult {
  const people = options.people ?? twoExitChoiceTest.people;
  const engine = createSimulationEngineFromScene(twoExitChoiceScene(people), {
    decisionBackend: createMallCrowdDecisionBackend({
      evacuationReactionSecondsFor: () => 0,
      seed: 11,
      shops: [],
    }),
    maxAgents: people,
  });
  engine.start();
  engine.setEvacuation(true);

  let snapshot = engine.snapshot();
  for (let step = 0; step < 600 * 60; step++) {
    engine.step(1 / 60);
    snapshot = engine.snapshot();
    if (snapshot.exitedCount >= people) break;
  }

  const exits = snapshot.evacuationExits ?? {};
  const near = exits["exit-1"] ?? 0;
  const far = exits["exit-2"] ?? 0;
  const cleared = snapshot.exitedCount >= people;
  const bothUsed = near > 0 && far > 0;
  const nearPreferred = near > far;

  return {
    number: 11,
    title: "Choice of escape route",
    status: cleared && bothUsed && nearPreferred ? "pass" : "fail",
    measured: cleared
      ? `exit 1 (nearer) took ${near}, exit 2 (further) took ${far}, of ${people}`
      : `did not clear: ${snapshot.exitedCount} of ${people} out, exit 1 ${near}, exit 2 ${far}`,
    criterion: `RiMEA 4.1.1 A 4 test 11 (p. 36, its Fig. 10): ${people} people occupying a space from the left at maximum density, two exits — nearer and further — immediate reaction. "The persons prefer the closer exit 1 and congestion occurs in this area. However, individual persons will also use the alternative exit 2." Judged on both halves: exit 1 gets more departures than exit 2, and exit 2 gets at least one. Each exit's own routing gap is ${routingGapMeters} m wide, not the guideline's 1 m, for the same router reason as test 9 — exit width is not what this test measures.`,
  };
}

/**
 * Test 8's building (A 3, p. 31, its Fig. 7): a three-storey test plan, each
 * floor built from four rows of 2 m x 3 m "rooms" holding four people each —
 * ground floor rows of 9/8/8/11 rooms (144 people), 1st and 2nd floor rows
 * of 11/8/8/11 (152 people each), 448 in total — a stair connecting ground
 * to 1st and 1st to 2nd (the guideline's own text: "on the 2nd floor there
 * are no more stairs upwards"), and a single ground-floor exit. Counted
 * directly off a 400 DPI render of the guideline's own page 32, row by row.
 *
 * Two simplifications, both disclosed rather than silently built around:
 *
 * 1. **Rooms have no doors.** Fig. 7's own door width is 1 m in a 2 m wide
 *    room — the same 1 m gap tests 9/11/12/15 already found this project's
 *    1 m routing grid cannot resolve (a wall segment marks every cell it
 *    touches, and two segments bounding a ~1 m gap between them mark both of
 *    the gap's own cells, sealing it), and widening it to the router's own
 *    working minimum (`routingGapMeters`, 2.4 m) would make a room's door
 *    wider than the room. So each "room" is an open three-sided alcove off
 *    its corridor — same position, same floor area, same headcount as
 *    Fig. 7, no per-room bottleneck modelled.
 * 2. **The path from each floor's two corridor bands to its stair (or, on
 *    the ground floor, its exit) is a single connecting corridor along the
 *    building's east edge.** Fig. 7 draws a jogged connection past the
 *    stairwell itself; this is a simplified, fully-connected reading of it,
 *    not the same bend — the test's own acceptance is "recorded in graphs",
 *    not a geometry match.
 *
 * Reaction time is immediate (test 9's own precedent, `evacuationReactionSecondsFor:
 * () => 0`), so what is measured is total clear time moving with each
 * parameter value, not premovement.
 *
 * The guideline's own worked example is speed ("z.B. Geschwindigkeit aller
 * Personen: 0,5 m/s, 0,75 m/s, 1,0 m/s"), and this project's engine has one
 * scenario-level speed knob (`speedMetersPerSecond`, the population's mean —
 * every other test in this file already sets it). The guideline's *second*
 * case — the same mean held fixed while the spread around it changes — has
 * no matching knob: this engine's per-agent speed spread is a fixed 19.4%
 * everywhere (`freeSpeedRelativeSigma`, `behaviorDistributions.ts`), not a
 * per-scenario setting. Building one for a single test would be new,
 * untested machinery for a test the guideline itself says is not scored
 * ("results recorded in graphs... freely accessible", no pass/fail); this
 * test instead varies the mean across the guideline's own three example
 * points and reports total clear time for each — the method the guideline
 * demonstrates, scoped to the one axis this engine already exposes.
 */
export const parameterStudyTest = {
  roomWidthMeters: 2,
  roomDepthMeters: 3,
  corridorWidthMeters: 2,
  peoplePerRoom: 4,
  groundRowCounts: [9, 8, 8, 11] as const,
  upperRowCounts: [11, 8, 8, 11] as const,
  speedsMetersPerSecond: [0.5, 0.75, 1.0] as const,
} as const;

function parameterStudyFloorPlan(rowCounts: readonly [number, number, number, number]) {
  const Rw = parameterStudyTest.roomWidthMeters;
  const Rd = parameterStudyTest.roomDepthMeters;
  const Cw = parameterStudyTest.corridorWidthMeters;
  const [n1, n2, n3, n4] = rowCounts;
  const wmax = Math.max(n1, n2, n3, n4) * Rw;
  const height = 4 * Rd + 2 * Cw;
  return {
    Rw,
    Rd,
    wmax,
    height,
    spineX: wmax + Cw / 2,
    rowY: {
      row1: [0, Rd] as const,
      row2: [Rd + Cw, 2 * Rd + Cw] as const,
      row3: [2 * Rd + Cw, 3 * Rd + Cw] as const,
      row4: [3 * Rd + 2 * Cw, height] as const,
    },
    spineWallX: wmax,
  };
}

type WallInput = {
  id: string;
  floorId: string;
  geometry: { type: "polyline"; points: { x: number; y: number }[] };
};

function wallLine(
  id: string,
  floorId: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): WallInput {
  return {
    id,
    floorId,
    geometry: {
      type: "polyline",
      points: [
        { x: x1, y: y1 },
        { x: x2, y: y2 },
      ],
    },
  };
}

/** The room dividers and outer back wall for one row — open on the corridor side. */
function roomRowWalls(
  floorId: string,
  rowId: "row1" | "row2" | "row3" | "row4",
  count: number,
  [yTop, yBottom]: readonly [number, number],
  backWallY: number,
): WallInput[] {
  const Rw = parameterStudyTest.roomWidthMeters;
  const walls = [
    wallLine(`${floorId}-${rowId}-back`, floorId, 0, backWallY, count * Rw, backWallY),
  ];
  for (let i = 0; i <= count; i++) {
    walls.push(
      wallLine(`${floorId}-${rowId}-div-${i}`, floorId, i * Rw, yTop, i * Rw, yBottom),
    );
  }
  return walls;
}

function roomRowEntrances(
  floorId: string,
  rowId: "row1" | "row2" | "row3" | "row4",
  count: number,
  y: number,
) {
  const Rw = parameterStudyTest.roomWidthMeters;
  return Array.from({ length: count }, (_, i) => ({
    id: `${floorId}-${rowId}-room-${i}`,
    floorId,
    kind: "source" as const,
    position: { x: i * Rw + Rw / 2, y },
    width: Rw,
    arrivalProfile: {
      intervalMinutes: 1,
      ratesPerMinute: [parameterStudyTest.peoplePerRoom * 1.5],
    },
    arrivalRatePerMinute: 0,
    groupShare: 0,
  }));
}

const parameterStudyRowIds = ["row1", "row2", "row3", "row4"] as const;

function parameterStudyFloorWallsAndEntrances(
  floorId: string,
  rowCounts: readonly [number, number, number, number],
) {
  const plan = parameterStudyFloorPlan(rowCounts);
  // Row 1 and row 4 back onto the building's own north/south exterior; rows
  // 2 and 3 back onto each other across the spine (`parameterStudyFloorPlan`'s
  // own doc comment on `rowY`).
  const backWallY = [0, plan.height / 2, plan.height / 2, plan.height];
  const rows = parameterStudyRowIds.map((rowId, index) => ({
    rowId,
    count: rowCounts[index],
    range: plan.rowY[rowId],
    backWallY: backWallY[index],
  }));

  const walls: WallInput[] = [
    wallLine(
      `${floorId}-north`,
      floorId,
      0,
      0,
      plan.wmax + parameterStudyTest.corridorWidthMeters,
      0,
    ),
    wallLine(
      `${floorId}-south`,
      floorId,
      0,
      plan.height,
      plan.wmax + parameterStudyTest.corridorWidthMeters,
      plan.height,
    ),
    wallLine(`${floorId}-west`, floorId, 0, 0, 0, plan.height),
    // The spine between the two corridor bands — the only way from one to
    // the other is around its east end, through the connecting corridor.
    wallLine(
      `${floorId}-spine-wall`,
      floorId,
      0,
      plan.height / 2,
      plan.spineWallX,
      plan.height / 2,
    ),
    ...rows.flatMap((row) =>
      roomRowWalls(floorId, row.rowId, row.count, row.range, row.backWallY),
    ),
  ];
  const entrances = rows.flatMap((row) =>
    roomRowEntrances(floorId, row.rowId, row.count, row.range[0] + plan.Rd / 2),
  );
  return { walls, entrances, plan };
}

function parameterStudyScene(
  speedMetersPerSecond: number,
  groundRowCounts: readonly [number, number, number, number],
  upperRowCounts: readonly [number, number, number, number],
): CrowdSimScene {
  const ground = parameterStudyFloorWallsAndEntrances("ground", groundRowCounts);
  const first = parameterStudyFloorWallsAndEntrances("first", upperRowCounts);
  const second = parameterStudyFloorWallsAndEntrances("second", upperRowCounts);
  const half = routingGapMeters / 2;
  const exitY = ground.plan.height / 2;
  const eastX = ground.plan.wmax + parameterStudyTest.corridorWidthMeters;

  return parseScene({
    schemaVersion: "1.0.0",
    id: "rimea-test-8",
    name: "RiMEA test 8: parameter study",
    seed: 8,
    speedMetersPerSecond,
    world: { width: eastX + 4, height: ground.plan.height },
    floors: [
      { id: "ground", level: 0, elevationMeters: 0 },
      { id: "first", level: 1, elevationMeters: 4 },
      { id: "second", level: 2, elevationMeters: 8 },
    ],
    walls: [
      ...ground.walls,
      wallLine("ground-east-1", "ground", eastX, 0, eastX, exitY - half),
      wallLine(
        "ground-east-2",
        "ground",
        eastX,
        exitY + half,
        eastX,
        ground.plan.height,
      ),
      ...first.walls,
      wallLine("first-east", "first", eastX, 0, eastX, first.plan.height),
      ...second.walls,
      wallLine("second-east", "second", eastX, 0, eastX, second.plan.height),
    ],
    entrances: [
      ...ground.entrances,
      ...first.entrances,
      ...second.entrances,
      {
        id: "exit",
        floorId: "ground",
        kind: "sink",
        position: { x: eastX + 2, y: exitY },
        width: routingGapMeters,
      },
    ],
    connectors: [
      {
        id: "stair-first-ground",
        kind: "stair",
        from: {
          floorId: "first",
          point: { x: first.plan.spineX, y: first.plan.height / 2 - 2 },
        },
        to: { floorId: "ground", point: { x: ground.plan.spineX, y: exitY } },
        width: 2,
        bidirectional: true,
      },
      {
        id: "stair-second-first",
        kind: "stair",
        from: {
          floorId: "second",
          point: { x: second.plan.spineX, y: second.plan.height / 2 },
        },
        to: {
          floorId: "first",
          point: { x: first.plan.spineX, y: first.plan.height / 2 + 2 },
        },
        width: 2,
        bidirectional: true,
      },
    ],
  });
}

/** How many people the plan puts on one floor. */
function parameterStudyFloorPeople(
  rowCounts: readonly [number, number, number, number],
) {
  return rowCounts.reduce((sum, n) => sum + n, 0) * parameterStudyTest.peoplePerRoom;
}

/** Seconds for everyone in the building to reach the ground-floor exit. */
function clearParameterStudyBuilding(
  speedMetersPerSecond: number,
  groundRowCounts: readonly [number, number, number, number],
  upperRowCounts: readonly [number, number, number, number],
): number {
  const totalPeople =
    parameterStudyFloorPeople(groundRowCounts) +
    2 * parameterStudyFloorPeople(upperRowCounts);
  const engine = createSimulationEngineFromScene(
    parameterStudyScene(speedMetersPerSecond, groundRowCounts, upperRowCounts),
    {
      decisionBackend: createMallCrowdDecisionBackend({
        evacuationReactionSecondsFor: () => 0,
        seed: 8,
        shops: [],
      }),
      maxAgents: totalPeople,
    },
  );
  engine.start();
  engine.setEvacuation(true);

  for (let step = 0; step < 1800 * 60; step++) {
    engine.step(1 / 60);
    if (engine.snapshot().exitedCount >= totalPeople) {
      return engine.snapshot().elapsedSeconds;
    }
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * Test 8: how does total clear time move with the population's mean speed,
 * across the guideline's own three example values?
 */
export function runParameterStudyTest(
  options: {
    /**
     * Cut-down row counts, for exercising this code path without the full
     * 448-person building. **A result produced with these is not the
     * test**: the guideline's own row counts (from Fig. 7) are the
     * defaults, and the panel uses the defaults.
     */
    groundRowCounts?: readonly [number, number, number, number];
    upperRowCounts?: readonly [number, number, number, number];
  } = {},
): RimeaTestResult {
  const groundRowCounts = options.groundRowCounts ?? [
    ...parameterStudyTest.groundRowCounts,
  ];
  const upperRowCounts = options.upperRowCounts ?? [
    ...parameterStudyTest.upperRowCounts,
  ];
  const totalPeople =
    parameterStudyFloorPeople(groundRowCounts) +
    2 * parameterStudyFloorPeople(upperRowCounts);
  const results = parameterStudyTest.speedsMetersPerSecond.map((speed) => ({
    speed,
    seconds: clearParameterStudyBuilding(speed, groundRowCounts, upperRowCounts),
  }));
  const allCleared = results.every((r) => Number.isFinite(r.seconds));
  // Not a pass/fail bound (the guideline scores nothing here) — only a
  // sanity check that a faster population does not come out slower.
  const monotonic = results.every(
    (r, i) => i === 0 || r.seconds <= results[i - 1].seconds + 1e-6,
  );

  return {
    number: 8,
    title: "Parameter study",
    status: allCleared && monotonic ? "pass" : "fail",
    measured: allCleared
      ? results.map((r) => `${r.speed} m/s: ${r.seconds.toFixed(1)} s`).join(", ")
      : `did not clear at every speed: ${results.map((r) => `${r.speed} m/s: ${Number.isFinite(r.seconds) ? `${r.seconds.toFixed(1)} s` : "never"}`).join(", ")}`,
    criterion: `RiMEA 4.1.1 A 3 test 8 (p. 31, its Fig. 7): ${totalPeople} people across a three-storey test plan (144/152/152 by floor at the guideline's own row counts), one stair per floor pair, one exit. The guideline's own worked example varies the population's speed (0.5/0.75/1.0 m/s) and asks for total clear time to be "recorded in graphs" — it sets no pass/fail bound. Reported here as clear time per speed, sanity-checked only for the direction any physically sound model must move (faster population, no slower a clear); the guideline's second case (same mean, wider spread) is not built — see this test's own doc comment for why.`,
  };
}

/**
 * Test 13's setup (A 4, pp. 42-43, its Fig. 16/17): a 10 m x 10 m room of
 * 100 agents, a stair whose *horizontal projection* is 5 m long and 2 m
 * wide (2 m level approach on each end), and a goal past it. Fig. 17 is
 * captioned "upwards"; the guideline's own text says the downward scenario
 * uses the same geometry with the stair reversed — built here by swapping
 * which of two floors holds the room and which holds the goal, the same
 * technique `stairSpeedScene` already uses for tests 2 and 3.
 *
 * Speed and density are measured over the stair's own horizontal projected
 * area (5 m x 2 m = 10 m^2), not the slope length this project's connectors
 * actually walk (`flightLengthMeters`) — unlike tests 2/3, which measure a
 * single person's speed along the slope itself, because that is what the
 * guideline's own y-axis and x-axis are defined against here.
 *
 * `stairCrowdRiseMeters` is the floor-elevation difference that gives a 30°
 * flight (`connectorPitchDegrees`, this project's own fixed pitch) exactly
 * this horizontal run: rise = horizontal * tan(30 deg).
 *
 * Fig. 16 is a shaded speed-density band read off a real test, "widely
 * spread" in the guideline's own words, with no printed data table.
 * `stairCrowdBand` digitises it off the guideline's own printed gridlines
 * (400 DPI render of p. 42) at density in {0.6, 0.8, 1.0, 1.2, 1.4, 1.5}
 * P/m^2 for each direction — the same practice test 7 already used for
 * Fig. 3's curve, and, like that one, a read of a chart, not a citation of
 * numbers RiMEA prints. `stairCrowdBandAt` interpolates linearly between
 * those points and returns null outside the digitised domain.
 */
export const stairCrowdTest = {
  roomSizeMeters: 10,
  people: 100,
  stairHorizontalMeters: 5,
  stairWidthMeters: 2,
  approachMeters: 2,
  measureIntervalSeconds: 1,
} as const;

const stairCrowdRiseMeters =
  stairCrowdTest.stairHorizontalMeters *
  Math.tan((connectorPitchDegrees * Math.PI) / 180);

/**
 * The two bands' lower edges are cleanly separated at every gridline read
 * (descending always higher). Their upper edges visually converge and, at
 * this table's own far end (1.5 P/m^2), cross by 0.01 m/s — inside the
 * error of reading a printed chart by eye at 400 DPI, not a claim that the
 * climbing band's fastest quartile beats the descending one's there. The
 * lower-edge comparison is what `rimeaSuite.test.ts` asserts against this
 * table for that reason.
 */
const stairCrowdBand: Record<
  "up" | "down",
  readonly { density: number; high: number; low: number }[]
> = {
  down: [
    { density: 0.6, high: 1.12, low: 0.66 },
    { density: 0.8, high: 1.0, low: 0.6 },
    { density: 1.0, high: 0.89, low: 0.55 },
    { density: 1.2, high: 0.81, low: 0.5 },
    { density: 1.4, high: 0.76, low: 0.48 },
    { density: 1.5, high: 0.73, low: 0.48 },
  ],
  up: [
    { density: 0.6, high: 1.02, low: 0.48 },
    { density: 0.8, high: 0.93, low: 0.46 },
    { density: 1.0, high: 0.86, low: 0.46 },
    { density: 1.2, high: 0.8, low: 0.46 },
    { density: 1.4, high: 0.76, low: 0.46 },
    { density: 1.5, high: 0.74, low: 0.46 },
  ],
};

export function stairCrowdBandAt(
  direction: "up" | "down",
  density: number,
): { high: number; low: number } | null {
  const points = stairCrowdBand[direction];

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];

    if (density >= a.density && density <= b.density) {
      const t = (density - a.density) / (b.density - a.density);
      return { high: a.high + t * (b.high - a.high), low: a.low + t * (b.low - a.low) };
    }
  }

  return null; // outside every gridline segment this project digitised
}

function stairCrowdScene(direction: "up" | "down", seed: number): CrowdSimScene {
  const t = stairCrowdTest;
  const roomFloor = direction === "up" ? "lower" : "upper";
  const goalFloor = direction === "up" ? "upper" : "lower";
  const half = t.stairWidthMeters / 2;
  const corridorY = [t.roomSizeMeters / 2 - half, t.roomSizeMeters / 2 + half] as const;
  const roomEastX = t.roomSizeMeters;
  const stairMouthX = roomEastX + t.approachMeters;
  const goalMouthX = stairMouthX + t.approachMeters;
  // A world's coordinates never go below (0,0) (`clampPointToWorld`), so the
  // goal sink sits a metre past the departure corridor's own open end,
  // rather than exactly on it — the same margin every other test in this
  // file gives a sink, for the same reason (a first version elsewhere
  // stranded agents at the door by skipping it).
  const goalX = goalMouthX + 1;

  return parseScene({
    schemaVersion: "1.0.0",
    id: `rimea-test-13-${direction}-${seed}`,
    name: `RiMEA test 13: stair crowd, ${direction}`,
    seed,
    speedMetersPerSecond: corridorTest.speedMetersPerSecond,
    world: { width: goalX + 3, height: t.roomSizeMeters },
    floors: [
      { id: "lower", level: 0, elevationMeters: 0 },
      { id: "upper", level: 1, elevationMeters: stairCrowdRiseMeters },
    ],
    walls: [
      wallLine("room-north", roomFloor, 0, 0, roomEastX, 0),
      wallLine(
        "room-south",
        roomFloor,
        0,
        t.roomSizeMeters,
        roomEastX,
        t.roomSizeMeters,
      ),
      wallLine("room-west", roomFloor, 0, 0, 0, t.roomSizeMeters),
      wallLine("room-east-1", roomFloor, roomEastX, 0, roomEastX, corridorY[0]),
      wallLine(
        "room-east-2",
        roomFloor,
        roomEastX,
        corridorY[1],
        roomEastX,
        t.roomSizeMeters,
      ),
      wallLine(
        "approach-north",
        roomFloor,
        roomEastX,
        corridorY[0],
        stairMouthX,
        corridorY[0],
      ),
      wallLine(
        "approach-south",
        roomFloor,
        roomEastX,
        corridorY[1],
        stairMouthX,
        corridorY[1],
      ),
      wallLine(
        "departure-north",
        goalFloor,
        stairMouthX,
        corridorY[0],
        goalMouthX,
        corridorY[0],
      ),
      wallLine(
        "departure-south",
        goalFloor,
        stairMouthX,
        corridorY[1],
        goalMouthX,
        corridorY[1],
      ),
    ],
    connectors: [
      {
        id: "stair",
        kind: "stair",
        from: {
          floorId: roomFloor,
          point: { x: stairMouthX, y: t.roomSizeMeters / 2 },
        },
        to: { floorId: goalFloor, point: { x: stairMouthX, y: t.roomSizeMeters / 2 } },
        width: t.stairWidthMeters,
        bidirectional: false,
      },
    ],
    entrances: [
      {
        id: "occupants",
        floorId: roomFloor,
        kind: "source",
        position: { x: roomEastX / 2, y: t.roomSizeMeters / 2 },
        width: roomEastX,
        arrivalProfile: { intervalMinutes: 1, ratesPerMinute: [t.people * 1.5] },
        arrivalRatePerMinute: 0,
        groupShare: 0,
      },
      {
        id: "goal",
        floorId: goalFloor,
        kind: "sink",
        position: { x: goalX, y: t.roomSizeMeters / 2 },
        width: t.stairWidthMeters,
      },
    ],
  });
}

/**
 * Density (people per m^2 of the stair's horizontal projection) and mean
 * walking speed, sampled every `measureIntervalSeconds` while anyone is on
 * the stair's own flight lane.
 */
function measureStairCrowd(
  direction: "up" | "down",
  seed: number,
): readonly { density: number; speed: number }[] {
  const t = stairCrowdTest;
  const engine = createSimulationEngineFromScene(stairCrowdScene(direction, seed), {
    maxAgents: t.people,
  });
  engine.start();

  const laneId = flightFloorId("stair");
  const areaSquareMeters = t.stairHorizontalMeters * t.stairWidthMeters;
  const stepsPerSample = Math.round(t.measureIntervalSeconds * 60);
  const samples: { density: number; speed: number }[] = [];

  for (let step = 0; step < 600 * 60; step++) {
    engine.step(1 / 60);
    const snapshot = engine.snapshot();

    if (step % stepsPerSample === 0) {
      const onStair = snapshot.agents.filter((agent) => agent.floorId === laneId);
      if (onStair.length > 0) {
        samples.push({
          density: onStair.length / areaSquareMeters,
          speed:
            onStair.reduce(
              (sum, agent) =>
                sum + Math.sqrt(agent.vx * agent.vx + agent.vy * agent.vy),
              0,
            ) / onStair.length,
        });
      }
    }

    if (snapshot.exitedCount >= t.people) {
      break;
    }
  }

  return samples;
}

/**
 * Test 13: does speed-vs-density on the stair fall inside Fig. 16's own
 * digitised band, and is the descending run faster than the climbing one?
 *
 * Judged on a *majority* of in-domain samples falling inside the band, not
 * all of them — the guideline's own text calls its reference data "widely
 * spread", so a strict every-sample bound would be truer to a cleaner
 * dataset than the one RiMEA actually published. Direction is judged more
 * strictly: every density bin the two runs share should show the
 * descending mean faster, since that ordering is the guideline's own
 * explicit, unqualified claim ("this should be reproduced by the
 * simulation"), not a spread it is describing.
 */
export function runStairCrowdTest(): RimeaTestResult {
  const up = measureStairCrowd("up", 13);
  const down = measureStairCrowd("down", 14);

  function bandShare(
    direction: "up" | "down",
    samples: readonly { density: number; speed: number }[],
  ) {
    let inDomain = 0;
    let inside = 0;
    for (const sample of samples) {
      const band = stairCrowdBandAt(direction, sample.density);
      if (!band) continue;
      inDomain++;
      if (sample.speed >= band.low && sample.speed <= band.high) inside++;
    }
    return inDomain === 0 ? null : { inDomain, inside };
  }

  // 0.2 P/m², Fig. 16's own gridline spacing (0.6, 0.8, 1.0, ...) — coarse
  // enough that a bin actually collects more than a sample or two from a
  // density trajectory that is sweeping through, not sitting still at one
  // value.
  const densityBinWidth = 0.2;

  function meanSpeedByBin(samples: readonly { density: number; speed: number }[]) {
    const bins = new Map<number, { count: number; sum: number }>();
    for (const sample of samples) {
      const bin = Math.round(sample.density / densityBinWidth) * densityBinWidth;
      const entry = bins.get(bin) ?? { count: 0, sum: 0 };
      entry.count += 1;
      entry.sum += sample.speed;
      bins.set(bin, entry);
    }
    return bins;
  }

  const upShare = bandShare("up", up);
  const downShare = bandShare("down", down);
  const upBins = meanSpeedByBin(up);
  const downBins = meanSpeedByBin(down);
  // A bin either run visited only once or twice (typically the lowest —
  // one or two pioneers on the stair before the rest of the crowd catches
  // up) is a mean of noise, not of the flow: this project's own 19% speed
  // spread alone can flip a 1-sample "mean" either way. Comparing means
  // needs more than that to say anything; `minSamplesPerBin` is this test's
  // own choice for "enough", not a value RiMEA gives.
  const minSamplesPerBin = 3;
  let comparedBins = 0;
  let downFasterBins = 0;
  for (const [bin, upEntry] of upBins) {
    const downEntry = downBins.get(bin);
    if (!downEntry) continue;
    if (upEntry.count < minSamplesPerBin || downEntry.count < minSamplesPerBin)
      continue;
    comparedBins++;
    if (downEntry.sum / downEntry.count > upEntry.sum / upEntry.count) {
      downFasterBins++;
    }
  }

  const bothMeasured = up.length > 0 && down.length > 0;
  const bandOk =
    upShare !== null &&
    downShare !== null &&
    upShare.inside / upShare.inDomain >= 0.5 &&
    downShare.inside / downShare.inDomain >= 0.5;
  const directionOk = comparedBins > 0 && downFasterBins === comparedBins;

  return {
    number: 13,
    title: "Fundamental diagram on stairs",
    status: bothMeasured && bandOk && directionOk ? "pass" : "fail",
    measured: bothMeasured
      ? `up: ${up.length} samples${upShare ? `, ${upShare.inside}/${upShare.inDomain} inside Fig. 16's band` : " (none in its density domain)"}; down: ${down.length} samples${downShare ? `, ${downShare.inside}/${downShare.inDomain} inside band` : " (none in its density domain)"}; descending faster at ${downFasterBins}/${comparedBins} compared density bins`
      : `up ${up.length} samples, down ${down.length} samples`,
    criterion: `RiMEA 4.1.1 A 4 test 13 (p. 42-43, its Fig. 16/17): ${stairCrowdTest.people} agents in a ${stairCrowdTest.roomSizeMeters} m x ${stairCrowdTest.roomSizeMeters} m room walk through a stair whose horizontal projection is ${stairCrowdTest.stairHorizontalMeters} m x ${stairCrowdTest.stairWidthMeters} m to a goal, once climbing and once descending. Density and speed sampled every ${stairCrowdTest.measureIntervalSeconds} s over the stair's own horizontal projected area. Judged against Fig. 16's own shaded band, digitised off the guideline's printed chart (it prints no data table): a majority of in-domain samples inside the band in each direction, and the descending run faster than the climbing one at every compared density bin both runs sampled at least ${minSamplesPerBin} times — a self-chosen floor against comparing two 1-sample means, not a value RiMEA gives.`,
  };
}

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
      "A 4, p. 44 (its Fig. 18): a start and target connected by two stairs and a corridor on the ground floor, and by a longer corridor on the upper floor — but the figure is an undimensioned isometric schematic, unlike every other test here. Building it would mean inventing lengths RiMEA does not give, not reading them off the page.",
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
