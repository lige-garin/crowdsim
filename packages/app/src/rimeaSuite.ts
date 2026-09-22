import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import {
  bodyRadiusRangeMeters,
  sampleUniformReactionSeconds,
} from "./behaviorDistributions";
import { measureCorridorSpeed } from "./fundamentalDiagramHarness";
import { connectorSpeeds, flightFloorId } from "./floorRouting";
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

function corridorScene(seed: number): CrowdSimScene {
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
    speedMetersPerSecond: corridorTest.speedMetersPerSecond,
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
function walkCorridorOnce(seed: number): number | null {
  const engine = createSimulationEngineFromScene(corridorScene(seed), {
    maxAgents: 1,
  });
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
    number: 7,
    title: "Allocation of demographic parameters",
    status: "needs-scenario",
    blockedBy:
      "A 2, p. 31: distribute walking speeds over 50 adults per the guideline's own Figure 2 and show the simulated distribution matches it. ADR-0011 can draw a declared population, but Figure 2's table has not been transcribed.",
  },
  {
    number: 8,
    title: "Parameter study",
    status: "needs-scenario",
    blockedBy:
      "A 3, p. 31: vary one person parameter at a time on the guideline's three-storey plan (its Figure 7) and show how total evacuation time moves. Needs that plan.",
  },
  {
    number: 9,
    title: "Crowd of people leaving a large public space",
    status: "needs-scenario",
    blockedBy: "A 4, p. 34: qualitative verification; geometry not yet transcribed.",
  },
  {
    number: 10,
    title: "Allocation of escape routes",
    status: "needs-scenario",
    blockedBy: "A 4, p. 35: geometry not yet transcribed.",
  },
  {
    number: 11,
    title: "Choice of escape route",
    status: "needs-scenario",
    blockedBy: "A 4, p. 36: geometry not yet transcribed.",
  },
  {
    number: 12,
    title: "Effect of bottlenecks",
    status: "needs-scenario",
    blockedBy: "A 4, p. 37: geometry not yet transcribed.",
  },
  {
    number: 13,
    title: "Fundamental diagram on stairs",
    status: "needs-scenario",
    blockedBy:
      "A 4, p. 42-43 (its Fig. 17): a 10 m x 10 m room of 100 agents flowing through a 2 m wide, 5 m long stair (2 m approach on each side) to a goal, run once climbing and once descending; density and speed are read over the stair's horizontal projected area, not the slope length this project's connectors use. Judged against Fig. 16, a shaded speed-density band read off a real test with no printed table — it needs digitising before anything can be compared to it, and against showing the descending run faster than the climbing one at the same density. Stairs a crowd can stand on exist now (buildFlightLane); this is a different, still-unbuilt scenario and a still-undigitised reference, not the same blocker as tests 2 and 3.",
  },
  {
    number: 14,
    title: "Choice of route",
    status: "needs-scenario",
    blockedBy: "A 4, p. 44: geometry not yet transcribed.",
  },
  {
    number: 15,
    title: "Movement of a large crowd of pedestrians around a corner",
    status: "needs-scenario",
    blockedBy: "A 4, p. 45: geometry not yet transcribed.",
  },
];

/**
 * Every test, in the guideline's order, with the one that has been built in
 * place. Running it measures — seconds of it — so the panel calls this in a
 * worker; `options` exists only so a test can walk the path cheaply.
 */
export function runRimeaSuite(
  options: Parameters<typeof runFundamentalDiagramTest>[0] & {
    corridorRuns?: number;
  } = {},
): readonly RimeaTestResult[] {
  return [
    ...unattemptedRimeaTests,
    runCorridorSpeedTest(options.corridorRuns),
    runPremovementTest(),
    runStairSpeedTest("up"),
    runStairSpeedTest("down"),
    runCornerTest(),
    runFundamentalDiagramTest(options),
    runOneDimensionalFundamentalDiagramTest(options),
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
