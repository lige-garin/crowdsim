import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import { createSimulationEngineFromScene } from "../simulationEngine";
import type { RimeaTestResult } from "./shared";
import { corridorTest } from "./test01Corridor";

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
