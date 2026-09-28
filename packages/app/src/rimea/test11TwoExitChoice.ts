import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import { createMallCrowdDecisionBackend } from "../engine/mallCrowdDecisionBackend";
import { createSimulationEngineFromScene } from "../engine/simulationEngine";
import { routingGapMeters, type RimeaTestResult } from "./shared";
import { corridorTest } from "./test01Corridor";

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
