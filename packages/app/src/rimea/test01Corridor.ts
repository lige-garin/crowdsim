import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import { createSimulationEngineFromScene } from "../simulationEngine";
import type { RimeaTestResult } from "./shared";

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
export function walkCorridorOnce(
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
