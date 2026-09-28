import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import { connectorSpeeds, flightFloorId } from "../engine/floorRouting";
import { createSimulationEngineFromScene } from "../engine/simulationEngine";
import type { RimeaTestResult } from "./shared";
import { corridorTest } from "./test01Corridor";

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
