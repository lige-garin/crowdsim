import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import { createMallCrowdDecisionBackend } from "../mallCrowdDecisionBackend";
import { createSimulationEngineFromScene } from "../simulationEngine";
import {
  routingGapMeters,
  wallLine,
  type RimeaTestResult,
  type WallInput,
} from "./shared";

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
