import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import { createSimulationEngineFromScene } from "../simulationEngine";
import type { RimeaTestResult } from "./shared";
import { corridorTest } from "./test01Corridor";

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
