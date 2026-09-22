import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import { measureCorridorSpeed } from "./fundamentalDiagramHarness";
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
    number: 2,
    title: "Maintaining the specified walking speed up stairs",
    status: "needs-scenario",
    blockedBy:
      "A 2, p. 29: one person on a 2 m wide, 10 m long (along the slope) staircase. Needs a stair whose length is walked, which connectors do not yet expose as geometry.",
  },
  {
    number: 3,
    title: "Maintaining the specified walking speed down stairs",
    status: "needs-scenario",
    blockedBy: "A 2, p. 29: as test 2, downwards.",
  },
  {
    number: 5,
    title: "Premovement time",
    status: "needs-scenario",
    blockedBy:
      "A 2, p. 30: ten people in an 8 m x 5 m room, 1 m exit in the middle of the 5 m wall, premovement times uniform on 10-100 s. The engine draws lognormal times (mean 16 s) and cannot yet be told to draw uniform ones.",
  },
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
      "A 4, p. 42: the speed-density relation on a staircase. Needs stair geometry a crowd can stand on, which connectors are not (they hold one person for a travel time).",
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
  {
    number: 16,
    title: "1D fundamental diagram",
    status: "needs-scenario",
    blockedBy:
      "A 4, p. 47: the corridor narrowed until nobody can overtake, so the diagram is reproduced for single-file movement (A 2, p. 30 asks for this too).",
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
    runCornerTest(),
    runFundamentalDiagramTest(options),
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
