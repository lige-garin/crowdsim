import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import { sampleUniformReactionSeconds } from "../engine/behaviorDistributions";
import { createMallCrowdDecisionBackend } from "../engine/mallCrowdDecisionBackend";
import { createSimulationEngineFromScene } from "../engine/simulationEngine";
import type { RimeaTestResult } from "./shared";
import { corridorTest } from "./test01Corridor";

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
