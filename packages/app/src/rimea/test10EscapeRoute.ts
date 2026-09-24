import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import { createSimulationEngineFromScene } from "../simulationEngine";
import type { RimeaTestResult } from "./shared";
import { corridorTest } from "./test01Corridor";

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
