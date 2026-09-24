import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import { createMallCrowdDecisionBackend } from "../mallCrowdDecisionBackend";
import { createSimulationEngineFromScene } from "../simulationEngine";
import { routingGapMeters, type RimeaTestResult } from "./shared";
import { corridorTest } from "./test01Corridor";

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
    criterion: `RiMEA 4.1.1 A 4 test 9 (p. 34, its Fig. 8): a 20 m x 20 m space, ${people} people, four 1 m doors, immediate reaction. Step 1: time for the last person to leave. Step 2: repeat with two doors locked. "The expected result is that it takes approximately twice as long" — but the guideline's own footnote says this should not be treated as an exclusion criterion, since a larger crowd queuing at the remaining doors may itself raise their flow; only that the room clears both times is judged here, and the ratio is reported, not scored. The doors' own routing gaps are ${routingGapMeters} m wide, not the guideline's 1 m — this project's routing grid cannot resolve a gap that size (see routingGapMeters' own comment in shared.ts); door width is not what this test measures, so the substitution does not change what is judged.`,
  };
}
