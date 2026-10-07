import type { WallSegment } from "@crowdsim/core-gpu";
import { describe, expect, it } from "vitest";
import { createRouter } from "./crowdNavigation";
import type { SimulationAgent } from "./simulationEngine";
import { stepCrowd, type SocialForceParameters } from "./crowdMovement";
import { createWallIndex } from "./wallIndex";
import { defaultSocialForceScreeningParameters } from "../analytics/sensitivityAnalysis";

const world = { width: 40, height: 20 };

function walker(overrides: Partial<SimulationAgent>): SimulationAgent {
  return {
    id: 1,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    targetX: 0,
    targetY: 0,
    radius: 0.23,
    speedFactor: 1,
    lifecycleState: "walk",
    ...overrides,
  };
}

function run(
  start: SimulationAgent[],
  seconds: number,
  walls: WallSegment[] = [],
  onStep?: (agents: SimulationAgent[]) => void,
  /**
   * Recompute the anticipatory push every Nth step. The engine runs at 3
   * (20 Hz); dropping it to 6 (10 Hz) is the obvious way to buy back step
   * time, and this is where that trade gets tested rather than assumed.
   */
  replanEvery = 1,
  parameters?: Partial<SocialForceParameters>,
) {
  const router = createRouter(world, walls);
  const index = createWallIndex(walls);
  let agents = start;
  for (let step = 0; step < seconds * 60; step++) {
    agents = stepCrowd({
      agents,
      dtSeconds: 1 / 60,
      exitRadius: () => 0,
      isExitBound: () => false,
      meanSpeedMetersPerSecond: 1.34,
      parameters,
      replanAnticipation: replanEvery === 1 ? true : step % replanEvery === 0,
      router,
      seed: 1,
      walls: index,
      world,
    }).agents;
    onStep?.(agents);
  }
  return agents;
}

/** Give-way distance and passing gap for a pair walking at each other. */
function headOnPassing(replanEvery = 1) {
  let startedAt = -1;
  let tightest = Infinity;
  run(
    [
      walker({ id: 1, x: 5, y: 10.05, vx: 1.3, targetX: 35, targetY: 10.05 }),
      walker({ id: 2, x: 25, y: 9.95, vx: -1.3, targetX: -5, targetY: 9.95 }),
    ],
    15,
    [],
    ([a, b]) => {
      tightest = Math.min(tightest, Math.hypot(a.x - b.x, a.y - b.y));
      if (startedAt < 0 && Math.abs(a.vy) > 0.1 && b.x > a.x) startedAt = b.x - a.x;
    },
    replanEvery,
  );
  return { startedAt, tightest };
}

const closestGap = (agents: SimulationAgent[]) => {
  let gap = Infinity;
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      gap = Math.min(
        gap,
        Math.hypot(agents[i].x - agents[j].x, agents[i].y - agents[j].y),
      );
    }
  }
  return gap;
};

describe("stepCrowd", () => {
  it("lets two people walking head-on pass without walking through each other", () => {
    let tightest = Infinity;
    const end = run(
      [
        walker({ id: 1, x: 5, y: 10, targetX: 35, targetY: 10 }),
        walker({ id: 2, x: 35, y: 10.05, targetX: 5, targetY: 10.05 }),
      ],
      30,
      [],
      (agents) => {
        tightest = Math.min(tightest, closestGap(agents));
      },
    );

    expect(end[0].x).toBeGreaterThan(34);
    expect(end[1].x).toBeLessThan(6);
    // Two bodies of 0.23 m: centres never closer than most of a shoulder width.
    expect(tightest).toBeGreaterThan(0.35);
  });

  it("starts giving way metres ahead, not at arm's length (anticipation)", () => {
    const { startedAt, tightest } = headOnPassing();

    // Measured 2026-09-19 with this setup: gives way 2.46 m out and passes
    // 0.53 m apart. The ledger quotes 2.85 m / 0.57 m; neither reproduces
    // here, and the give-way distance turns out to hinge on the starting
    // lateral offset — 1.38 m head-on, 2.46 m at 0.1 m, 2.65 m at 0.2 m —
    // because the trigger is a sideways speed, which a symmetric pair
    // barely produces until late. So only the passing gap is pinned tight:
    // it moves 0.534-0.568 across those same setups. Without the
    // time-to-collision term they turned away 0.5 m apart and their bodies
    // overlapped (0.43 m between centres).
    expect(startedAt).toBeGreaterThan(2.2);
    expect(tightest).toBeGreaterThan(0.51);
  });

  it("passes as safely when anticipation is replanned at 10 Hz as at 60 Hz", () => {
    // The engine replans at 20 Hz. Whether 10 Hz is affordable is the open
    // question behind the last of the step-time gap, so it is measured here
    // rather than argued: if a slower replan made people pass closer, this is
    // where it would show.
    const fast = headOnPassing(1);
    const slow = headOnPassing(6);

    expect(slow.tightest).toBeGreaterThan(fast.tightest - 0.05);
    expect(slow.tightest).toBeGreaterThan(0.51);
  });

  it("lets a faster walker overtake a slower one", () => {
    const end = run(
      [
        walker({ id: 1, x: 5, y: 10, speedFactor: 0.7, targetX: 39, targetY: 10 }),
        walker({ id: 2, x: 3, y: 10, speedFactor: 1.3, targetX: 39, targetY: 10 }),
      ],
      12,
    );

    expect(end[1].x).toBeGreaterThan(end[0].x);
  });

  it("brings someone holding a spot back to it after being crowded", () => {
    const end = run(
      [
        walker({
          id: 1,
          x: 20,
          y: 10,
          lifecycleState: "browse",
          targetX: 20,
          targetY: 10,
        }),
        walker({
          id: 2,
          x: 20.1,
          y: 10,
          lifecycleState: "browse",
          targetX: 20.1,
          targetY: 10,
        }),
      ],
      10,
    );

    expect(closestGap(end)).toBeGreaterThan(0.3);
    expect(Math.hypot(end[0].x - 20, end[0].y - 10)).toBeLessThan(0.5);
  });

  it("never pushes anyone through a wall, however hard the crowd presses", () => {
    const wall: WallSegment = { x1: 20, y1: 0, x2: 20, y2: 20 };
    const crowd = Array.from({ length: 40 }, (_, index) =>
      walker({
        id: index + 1,
        x: 14 + (index % 8) * 0.6,
        y: 7 + Math.floor(index / 8) * 0.6,
        targetX: 30,
        targetY: 10,
      }),
    );
    let crossed = 0;
    run(crowd, 20, [wall], (agents) => {
      crossed = Math.max(crossed, agents.filter((agent) => agent.x > 20).length);
    });

    expect(crossed).toBe(0);
  });

  // One NaN anywhere in a step poisons every agent it touches and then the
  // whole run, and the model's clamps are all plain `>` comparisons, which a
  // NaN passes straight through — so the failure would be silent and total.
  // The bounds below are the ones the sensitivity panel actually sweeps
  // (`defaultSocialForceScreeningParameters`), i.e. the range a user can
  // really reach, not an invented worst case.
  it("keeps every walker finite across the whole screened parameter range", () => {
    const crowd = Array.from({ length: 30 }, (_, index) =>
      walker({
        id: index + 1,
        x: 8 + (index % 6) * 0.7,
        y: 6 + Math.floor(index / 6) * 0.7,
        targetX: 32,
        targetY: 10,
        vx: 1.2,
      }),
    );

    // A NaN never heals — it propagates into every later step — so the final
    // state is enough to catch one anywhere in the run.
    for (const parameter of defaultSocialForceScreeningParameters) {
      for (const bound of [parameter.min, parameter.max]) {
        const end = run(crowd, 5, [], undefined, 1, {
          [parameter.id]: bound,
        } as Partial<SocialForceParameters>);
        const poisoned = end.find(
          (agent) =>
            !Number.isFinite(agent.x) ||
            !Number.isFinite(agent.y) ||
            !Number.isFinite(agent.vx) ||
            !Number.isFinite(agent.vy),
        );
        expect(poisoned, `${parameter.id}=${bound}`).toBeUndefined();
      }
    }
  });

  // The screen above cannot reach the anticipation parameters, because
  // `defaultSocialForceScreeningParameters` does not include them. That leaves
  // a real gap rather than a theoretical one: `movementParameters` is an
  // unvalidated `Partial<SocialForceParameters>` all the way from a worker
  // message, a sensitivity point and a Sobol point to the arithmetic below, and
  // the two values here are the ones that reach a NaN with nothing thrown.
  // Both divide by `anticipationHorizonSeconds` (`exp(-tau/t0)` and `1/t0`),
  // so a horizon of 0 makes the scale Infinity and 0·Infinity NaN.
  describe("anticipation with a horizon the formula cannot use", () => {
    // 2.5 m apart, walking at each other at 1.3 m/s. The distance matters:
    // `anticipationRangeMeters` is 3, so a pair further apart than that returns
    // at the first guard and never reaches the division these tests are about.
    // An earlier version of this used a 20 m pair — comfortably outside the
    // range — and so passed with the guards removed, which is the whole reason
    // the "still gives way" case below re-checks that a usable horizon is
    // actually doing something.
    const inRange = () => [
      walker({ id: 1, x: 5, y: 10, vx: 1.3, targetX: 35, targetY: 10 }),
      walker({ id: 2, x: 7.5, y: 10, vx: -1.3, targetX: -5, targetY: 10 }),
    ];

    const oneStep = (parameters?: Partial<SocialForceParameters>) =>
      stepCrowd({
        agents: inRange(),
        dtSeconds: 1 / 60,
        exitRadius: () => 0,
        isExitBound: () => false,
        meanSpeedMetersPerSecond: 1.34,
        parameters,
        replanAnticipation: true,
        router: createRouter(world, []),
        seed: 1,
        walls: createWallIndex([]),
        world,
      }).agents;

    it.each([
      ["zero", 0],
      ["not a number", Number.NaN],
    ])("leaves both walkers finite after one step when the horizon is %s", (_label, horizon) => {
      for (const agent of oneStep({ anticipationHorizonSeconds: horizon })) {
        expect(Number.isFinite(agent.x), `agent ${agent.id} x`).toBe(true);
        expect(Number.isFinite(agent.y), `agent ${agent.id} y`).toBe(true);
        expect(Number.isFinite(agent.vx), `agent ${agent.id} vx`).toBe(true);
        expect(Number.isFinite(agent.vy), `agent ${agent.id} vy`).toBe(true);
      }
    });

    // A negative horizon is deliberately absent from the list above. It is not
    // a NaN path: `exp(-tau/-3)` and `1/-3` are both finite, so the force comes
    // out a large-but-usable value and the step stays finite. An earlier
    // version of this test listed it and passed for the wrong reason — the
    // arithmetic never produced anything to refuse.

    it("changes the step at all with a usable horizon, so the cases above are not vacuous", () => {
      // A usable horizon has to actually move these two agents somewhere
      // different from a refused one. If the guard were simply disabling
      // anticipation for every horizon, this would compare equal and the two
      // tests above would pass for the wrong reason.
      //
      // The push is along x, not sideways: this pair is exactly head-on, so
      // `wy` and both `vy` are 0 and the y component is `-0` either way. An
      // earlier version asserted on `|vy|` and so read 0 for a healthy step and
      // for a NaN one alike — it passed against an implementation with the
      // guards deleted.
      const speedAfter = (parameters?: Partial<SocialForceParameters>) =>
        oneStep(parameters).map((agent) => agent.vx);

      const usable = speedAfter();
      const off = speedAfter({ anticipationStrength: 0 });

      expect(usable).not.toEqual(off);
      // A refused horizon leaves the pair on the pure-repulsion course, which
      // is what "the force did not apply" looks like from out here.
      expect(speedAfter({ anticipationHorizonSeconds: 0 })).toEqual(off);
    });

    it("refuses a non-finite anticipation cap instead of passing the force through", () => {
      // The pair has to be close enough that the push genuinely exceeds the
      // default cap of 5, or the clamp never runs and the guard is never
      // reached. An earlier version used 2.9 m, whose push is 1.18 — the clamp
      // was never applied, so the test passed against a deleted guard.
      //
      // At 1.2 m and 2.6 m/s closing the push is 47.7. Capped, it moves vx by
      // 0.083 in one step; uncapped, by 0.795 — an order of magnitude apart,
      // so "refused" cannot be confused with "clamped to something else".
      const fast = () => [
        walker({ id: 1, x: 5, y: 10, vx: 1.3, targetX: 35, targetY: 10 }),
        walker({ id: 2, x: 6.2, y: 10, vx: -1.3, targetX: -5, targetY: 10 }),
      ];
      const stepped = (parameters?: Partial<SocialForceParameters>) =>
        stepCrowd({
          agents: fast(),
          dtSeconds: 1 / 60,
          exitRadius: () => 0,
          isExitBound: () => false,
          meanSpeedMetersPerSecond: 1.34,
          parameters,
          replanAnticipation: true,
          router: createRouter(world, []),
          seed: 1,
          walls: createWallIndex([]),
          world,
        }).agents;

      const capped = stepped();
      const refused = stepped({ anticipationMaxAcceleration: Number.NaN });

      for (const agent of refused) {
        expect(Number.isFinite(agent.x), `agent ${agent.id} x`).toBe(true);
        expect(Number.isFinite(agent.vx), `agent ${agent.id} vx`).toBe(true);
      }

      // The brake pulls the two apart along x, so a *lower* vx is the capped
      // pair: the default cap of 5 holds the push to 5 m/s² and it ends the
      // step at 0.52. A NaN cap makes the guard zero the sum instead, so no
      // brake applies and the pair keeps almost all of its 1.3.
      //
      // Without the guard the refused pair would be driven apart at the full
      // 47.7 m/s² — 9.5× the cap, enough to reverse it inside one step. That is
      // the failure being prevented, and it is why this asserts the refused
      // pair is the *faster* one rather than spelling out a number.
      expect(capped[0].vx).toBeLessThan(refused[0].vx);
    });

    // A neighbour carrying a NaN velocity, which is the case the horizon gate
    // cannot see: this agent's own parameters are perfectly usable, and the NaN
    // is in the other body. Every guard in `anticipation` is a comparison, and
    // IEEE makes a comparison against NaN false, so the pair walks through all
    // of them and the NaN lands in the sum — from there into this agent's
    // position, and on the next step into everybody it stands next to.
    //
    // A NaN *position* cannot reach this loop at all: the neighbour buckets are
    // keyed on position, and `bucketKey(NaN)` names no cell, so such an agent
    // is never visited. That is why this uses a velocity and not a position —
    // the position version of this test passed against a deleted guard, because
    // the guard was never reached.
    it("does not spread a NaN velocity arriving from one neighbour", () => {
      const stepped = stepCrowd({
        agents: [
          walker({ id: 1, x: 5, y: 10, vx: 1.3, targetX: 35, targetY: 10 }),
          walker({ id: 2, x: 7.5, y: 10, vx: Number.NaN, targetX: -5, targetY: 10 }),
        ],
        dtSeconds: 1 / 60,
        exitRadius: () => 0,
        isExitBound: () => false,
        meanSpeedMetersPerSecond: 1.34,
        parameters: undefined,
        replanAnticipation: true,
        router: createRouter(world, []),
        seed: 1,
        walls: createWallIndex([]),
        world,
      }).agents;

      // The healthy agent stays healthy. Without the guard it takes the
      // neighbour's NaN into its own velocity and from there into its position.
      expect(Number.isFinite(stepped[0].vx)).toBe(true);
      expect(Number.isFinite(stepped[0].x)).toBe(true);
    });
  });
});
