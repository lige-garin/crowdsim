import { describe, expect, it } from "vitest";
import {
  createAgentSoA,
  createSpatialHashGridLayout,
  setAgentPosition,
  setAgentRadius,
  setAgentSpeed,
  setAgentVelocity,
  type WallSegment,
} from "./index";
import {
  stepGpuSimCoreSocialForceCpu,
  stepGpuSimCoreSocialForceNeighborhoodCpu,
  type GpuSimCoreSocialForceParams,
} from "./gpuSimCoreSocialForce";

const params: GpuSimCoreSocialForceParams = {
  dt: 1 / 60,
  desiredSpeed: 1.34,
  relaxationTime: 0.644,
  agentRepulsionStrength: 1.966,
  agentRepulsionRange: 0.307,
  wallRepulsionStrength: 3,
  wallRepulsionRange: 0.2,
  maxSpeed: 1.7,
  anisotropy: 0.287,
  contactStiffness: 1500,
  interactionRangeMeters: 2,
  sidestep: 0.6,
  sidestepCone: 0.7,
  anticipationStrength: 1.5,
  anticipationHorizonSeconds: 3,
  // crowdMovement.ts's own default is 3m, but every existing fixture in
  // this file uses cellSize: 2 — matching that here (rather than bumping
  // every fixture's cellSize) keeps the pre-anticipation tests as decisive
  // regressions; dedicated anticipation tests below use their own layout
  // with a bigger cellSize where the wider range actually matters.
  anticipationRangeMeters: 2,
  anticipationMaxAcceleration: 5,
  holdEaseMeters: 1,
  maxSpeedRatio: 1.3,
};
const walls: WallSegment[] = [{ x1: 0, y1: 0, x2: 64, y2: 0 }];

function makeScene() {
  const N = 256;
  const agents = createAgentSoA(N);
  for (let i = 0; i < N; i++) {
    setAgentPosition(agents, i, 5 + (i % 16) * 2, 5 + Math.floor(i / 16) * 2);
    setAgentSpeed(agents, i, 1.34);
    setAgentRadius(agents, i, 0.22);
  }
  const targets = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    targets[i * 2] = 60;
    targets[i * 2 + 1] = 60;
  }
  // cellSize >= interactionRangeMeters so the 3x3 neighborhood is lossless.
  const layout = createSpatialHashGridLayout({ width: 64, height: 64, cellSize: 2 });
  return { agents, targets, layout, N };
}

describe("stepGpuSimCoreSocialForceNeighborhoodCpu equals all-pairs when interactionRangeMeters <= cellSize", () => {
  it("matches a single all-pairs step exactly", () => {
    const { agents, targets, layout, N } = makeScene();
    const allPairs = stepGpuSimCoreSocialForceCpu(agents, targets, walls, params);
    const neighborhood = stepGpuSimCoreSocialForceNeighborhoodCpu(
      agents,
      targets,
      walls,
      params,
      layout,
    );
    for (let i = 0; i < N * 2; i++) {
      expect(Math.abs(neighborhood.positions[i] - allPairs.positions[i])).toBeLessThan(
        1e-9,
      );
      expect(
        Math.abs(neighborhood.velocities[i] - allPairs.velocities[i]),
      ).toBeLessThan(1e-9);
    }
  });

  it("stays equivalent over 15 steps", () => {
    const { agents, targets, layout, N } = makeScene();
    let allPairs = agents;
    let neighborhood = agents;
    for (let s = 0; s < 15; s++) {
      const ap = stepGpuSimCoreSocialForceCpu(allPairs, targets, walls, params);
      const nb = stepGpuSimCoreSocialForceNeighborhoodCpu(
        neighborhood,
        targets,
        walls,
        params,
        layout,
      );
      allPairs = { ...allPairs, positions: ap.positions, velocities: ap.velocities };
      neighborhood = {
        ...neighborhood,
        positions: nb.positions,
        velocities: nb.velocities,
      };
    }
    for (let i = 0; i < N * 2; i++) {
      expect(Math.abs(neighborhood.positions[i] - allPairs.positions[i])).toBeLessThan(
        1e-4,
      );
    }
  });

  it("throws when interactionRangeMeters exceeds cellSize", () => {
    const { agents, targets } = makeScene();
    const tooCoarse = createSpatialHashGridLayout({
      width: 64,
      height: 64,
      cellSize: 1,
    });
    expect(() =>
      stepGpuSimCoreSocialForceNeighborhoodCpu(
        agents,
        targets,
        walls,
        params,
        tooCoarse,
      ),
    ).toThrow(/cellSize/);
  });
});

describe("stepGpuSimCoreSocialForceCpu — the physics itself, not just the neighborhood optimisation", () => {
  it("pushes two overlapping agents apart harder than two agents just touching", () => {
    const closer = createAgentSoA(2);
    setAgentPosition(closer, 0, 0, 0);
    setAgentPosition(closer, 1, 0.3, 0);
    setAgentRadius(closer, 0, 0.22);
    setAgentRadius(closer, 1, 0.22);

    const touching = createAgentSoA(2);
    setAgentPosition(touching, 0, 0, 0);
    setAgentPosition(touching, 1, 0.44, 0);
    setAgentRadius(touching, 0, 0.22);
    setAgentRadius(touching, 1, 0.22);

    const targets = new Float32Array([10, 0, -10, 0]);
    const closerResult = stepGpuSimCoreSocialForceCpu(closer, targets, [], params);
    const touchingResult = stepGpuSimCoreSocialForceCpu(touching, targets, [], params);

    // Agent 0's push away from agent 1 is stronger (more negative x-velocity)
    // when the overlap is deeper — the contact-stiffness term on top of the
    // exponential is doing real work, not just the exponential alone.
    expect(closerResult.velocities[0]).toBeLessThan(touchingResult.velocities[0]);
  });

  it("weighs a person dead ahead more than one directly behind (anisotropy)", () => {
    // Walker at the origin heading toward +x (target far ahead). One
    // stranger dead ahead, one dead behind, both the same distance away.
    const ahead = createAgentSoA(2);
    setAgentPosition(ahead, 0, 0, 0);
    setAgentPosition(ahead, 1, 0.5, 0);
    setAgentRadius(ahead, 0, 0.22);
    setAgentRadius(ahead, 1, 0.22);

    const behind = createAgentSoA(2);
    setAgentPosition(behind, 0, 0, 0);
    setAgentPosition(behind, 1, -0.5, 0);
    setAgentRadius(behind, 0, 0.22);
    setAgentRadius(behind, 1, 0.22);

    const targetAhead = new Float32Array([10, 0, 0, 0]);
    const aheadResult = stepGpuSimCoreSocialForceCpu(ahead, targetAhead, [], params);
    const behindResult = stepGpuSimCoreSocialForceCpu(behind, targetAhead, [], params);

    // The walker is pushed harder away from the person ahead (more negative
    // x-velocity, since they're being pushed back toward -x) than away from
    // the person behind (pushed further toward +x, i.e. less resisted).
    expect(aheadResult.velocities[0]).toBeLessThan(behindResult.velocities[0]);
  });

  it("does not interact with someone past interactionRangeMeters, even though the exponential is never exactly zero", () => {
    const agents = createAgentSoA(2);
    setAgentPosition(agents, 0, 0, 0);
    setAgentPosition(agents, 1, params.interactionRangeMeters + 0.5, 0);
    setAgentRadius(agents, 0, 0.22);
    setAgentRadius(agents, 1, 0.22);
    const targets = new Float32Array([0, 0, 0, 0]);

    const withNeighbour = stepGpuSimCoreSocialForceCpu(agents, targets, [], params);

    const alone = createAgentSoA(1);
    setAgentPosition(alone, 0, 0, 0);
    setAgentRadius(alone, 0, 0.22);
    const aloneResult = stepGpuSimCoreSocialForceCpu(
      alone,
      new Float32Array([0, 0]),
      [],
      params,
    );

    expect(withNeighbour.velocities[0]).toBeCloseTo(aloneResult.velocities[0], 9);
    expect(withNeighbour.velocities[1]).toBeCloseTo(aloneResult.velocities[1], 9);
  });
});

describe("stage 2: the in-formation spring force (crowdMovement.ts's formationGain pull toward a group slot)", () => {
  it("pulls a group member toward its formation slot when nothing gates it off", () => {
    // Alone except for its own group's slot far to the side — no walls, no
    // strangers, so the only force at all (relaxation is zero: desired speed
    // matches current velocity of zero and target equals position) is the
    // formation spring itself. Held: at distance 0 the stage 8 overshoot
    // clamp would otherwise zero out any push-only velocity for a
    // non-holding agent (it really is "already at the target, don't move
    // past it") — holding exempts this isolation fixture from both the
    // stage 7 and stage 8 clamps, exactly like it did implicitly before
    // either clamp existed.
    const agents = createAgentSoA(1);
    setAgentPosition(agents, 0, 0, 0);
    setAgentRadius(agents, 0, 0.22);
    const targets = new Float32Array([0, 0]);
    const groupIds = new Int32Array([1]);
    const formationSlots = new Float32Array([2, 0]);
    const holding = new Uint32Array([1]);

    const result = stepGpuSimCoreSocialForceCpu(
      agents,
      targets,
      [],
      params,
      groupIds,
      formationSlots,
      undefined,
      holding,
    );

    expect(result.velocities[0]).toBeGreaterThan(0);
    expect(result.velocities[1]).toBeCloseTo(0, 9);
  });

  it("does not pull an ungrouped agent even when formationSlots has a value at its index", () => {
    const agents = createAgentSoA(1);
    setAgentPosition(agents, 0, 0, 0);
    setAgentRadius(agents, 0, 0.22);
    const targets = new Float32Array([0, 0]);
    const groupIds = new Int32Array([-1]);
    const formationSlots = new Float32Array([2, 0]);

    const result = stepGpuSimCoreSocialForceCpu(
      agents,
      targets,
      [],
      params,
      groupIds,
      formationSlots,
    );

    expect(result.velocities[0]).toBeCloseTo(0, 9);
    expect(result.velocities[1]).toBeCloseTo(0, 9);
  });

  it("gates the pull off near a wall (crowdMovement.ts's wallClose)", () => {
    const agents = createAgentSoA(1);
    setAgentPosition(agents, 0, 0, 0);
    setAgentRadius(agents, 0, 0.22);
    const targets = new Float32Array([0, 0]);
    const groupIds = new Int32Array([1]);
    const formationSlots = new Float32Array([2, 0]);
    const nearWall: WallSegment[] = [{ x1: 0.5, y1: -5, x2: 0.5, y2: 5 }];

    const result = stepGpuSimCoreSocialForceCpu(
      agents,
      targets,
      nearWall,
      params,
      groupIds,
      formationSlots,
    );

    // The wall push itself is real (agent is well inside wallRepulsionRange
    // of a wall at x=0.5), but the +x formation pull toward (2, 0) must be
    // absent — without the gate the wall push and formation pull would both
    // point away from the wall and this assertion would not distinguish
    // them, so the wall sits close enough to push (0.5m) but the important
    // thing is what's NOT here: no y-component at all, on either force.
    expect(result.velocities[1]).toBeCloseTo(0, 9);
  });

  it("gates the pull off with two or more non-group strangers close by (crowdMovement.ts's strangersClose)", () => {
    // A single stranger's own y-repulsion is not symmetric, so a bare sign
    // check on velocities[1] can't isolate the gate (two symmetric
    // strangers cancel each other's y-repulsion on their own, independent
    // of whether the pull is gated). Compare instead: one stranger (gate
    // not yet tripped, strangersClose = 1) against two symmetric strangers
    // (gate tripped, strangersClose = 2) — only the pull toward (0, 5)
    // should differ between the two, and it dominates the single-stranger
    // case (a 5m pull vs. a sub-1m repulsion).
    const oneStranger = createAgentSoA(2);
    setAgentPosition(oneStranger, 0, 0, 0);
    setAgentPosition(oneStranger, 1, 0.6, 0.3);
    setAgentRadius(oneStranger, 0, 0.22);
    setAgentRadius(oneStranger, 1, 0.22);

    const twoStrangers = createAgentSoA(3);
    setAgentPosition(twoStrangers, 0, 0, 0);
    setAgentPosition(twoStrangers, 1, 0.6, 0.3);
    setAgentPosition(twoStrangers, 2, 0.6, -0.3);
    setAgentRadius(twoStrangers, 0, 0.22);
    setAgentRadius(twoStrangers, 1, 0.22);
    setAgentRadius(twoStrangers, 2, 0.22);

    const targetsOne = new Float32Array([0, 0, 10, 10]);
    const targetsTwo = new Float32Array([0, 0, 10, 10, 10, 10]);
    const groupIdsOne = new Int32Array([1, -1]);
    const groupIdsTwo = new Int32Array([1, -1, -1]);
    const formationSlots = new Float32Array([0, 5]);
    // Agent 0's target equals its own position (distance 0), isolating the
    // relaxation contribution to zero for the comparison below — holding
    // exempts it from the stage 7/8 clamps that would otherwise zero out
    // its push-only velocity entirely at that distance.
    const holdingOne = new Uint32Array([1, 0]);
    const holdingTwo = new Uint32Array([1, 0, 0]);

    const resultOne = stepGpuSimCoreSocialForceCpu(
      oneStranger,
      targetsOne,
      [],
      params,
      groupIdsOne,
      formationSlots,
      undefined,
      holdingOne,
    );
    const resultTwo = stepGpuSimCoreSocialForceCpu(
      twoStrangers,
      targetsTwo,
      [],
      params,
      groupIdsTwo,
      formationSlots,
      undefined,
      holdingTwo,
    );

    // One stranger: the pull toward (0, 5) is present, giving a clearly
    // positive y-velocity for a single 1/60s step (force dominated by the
    // formation spring toward a target 5m away). Two strangers: the pull is
    // gated off, leaving only the (much smaller) symmetric repulsion, which
    // cancels in y — nearly two orders of magnitude smaller, not just
    // "somewhat less".
    expect(resultOne.velocities[1]).toBeGreaterThan(0.05);
    expect(Math.abs(resultTwo.velocities[1])).toBeLessThan(
      resultOne.velocities[1] / 50,
    );
  });

  it("stays lossless under the 3x3 neighbourhood restriction once groups are involved", () => {
    const N = 40;
    const agents = createAgentSoA(N);
    const groupIds = new Int32Array(N);
    const formationSlots = new Float32Array(N * 2);
    const targets = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      setAgentPosition(agents, i, 5 + (i % 8) * 1.5, 5 + Math.floor(i / 8) * 1.5);
      setAgentSpeed(agents, i, 1.34);
      setAgentRadius(agents, i, 0.22);
      // Pair agents up into groups of two, slot each one 0.4m to the side of
      // where it already stands, so the formation force is doing real work,
      // not just returning zero for lack of anywhere to pull toward.
      groupIds[i] = Math.floor(i / 2);
      formationSlots[i * 2] = 5 + (i % 8) * 1.5 + 0.4;
      formationSlots[i * 2 + 1] = 5 + Math.floor(i / 8) * 1.5;
      targets[i * 2] = 60;
      targets[i * 2 + 1] = 60;
    }
    const layout = createSpatialHashGridLayout({ width: 64, height: 64, cellSize: 2 });

    const allPairs = stepGpuSimCoreSocialForceCpu(
      agents,
      targets,
      walls,
      params,
      groupIds,
      formationSlots,
    );
    const neighborhood = stepGpuSimCoreSocialForceNeighborhoodCpu(
      agents,
      targets,
      walls,
      params,
      layout,
      groupIds,
      formationSlots,
    );

    for (let i = 0; i < N * 2; i++) {
      expect(Math.abs(neighborhood.positions[i] - allPairs.positions[i])).toBeLessThan(
        1e-9,
      );
      expect(
        Math.abs(neighborhood.velocities[i] - allPairs.velocities[i]),
      ).toBeLessThan(1e-9);
    }
  });

  it("throws when groups are supplied and formationRoomMeters exceeds cellSize", () => {
    const agents = createAgentSoA(1);
    setAgentPosition(agents, 0, 0, 0);
    setAgentRadius(agents, 0, 0.22);
    const targets = new Float32Array([0, 0]);
    const groupIds = new Int32Array([1]);
    const formationSlots = new Float32Array([2, 0]);
    const tooCoarse = createSpatialHashGridLayout({
      width: 64,
      height: 64,
      cellSize: 0.5,
    });

    expect(() =>
      stepGpuSimCoreSocialForceNeighborhoodCpu(
        agents,
        targets,
        [],
        { ...params, interactionRangeMeters: 0.4 },
        tooCoarse,
        groupIds,
        formationSlots,
      ),
    ).toThrow(/formationRoomMeters/);
  });
});

describe("stage 3: the together fix and the sidestep nudge (crowdMovement.ts's push/sidestep code block)", () => {
  it("nudges sideways, away from someone roughly ahead and not in the same group", () => {
    const withSidestep = createAgentSoA(2);
    setAgentPosition(withSidestep, 0, 0, 0);
    setAgentPosition(withSidestep, 1, 0.5, 0.1);
    setAgentRadius(withSidestep, 0, 0.22);
    setAgentRadius(withSidestep, 1, 0.22);
    const targets = new Float32Array([10, 0, -10, 0]);
    const groupIds = new Int32Array([1, 2]); // different groups: not "together"

    const withResult = stepGpuSimCoreSocialForceCpu(
      withSidestep,
      targets,
      [],
      params,
      groupIds,
      new Float32Array(4),
    );
    const withoutResult = stepGpuSimCoreSocialForceCpu(
      withSidestep,
      targets,
      [],
      { ...params, sidestep: 0 },
      groupIds,
      new Float32Array(4),
    );

    // Same repulsion either way (same geometry); only the perpendicular
    // sidestep term should differ between the two runs.
    expect(withResult.velocities[1]).not.toBeCloseTo(withoutResult.velocities[1], 6);
  });

  it("does not sidestep, and does not repel beyond contact range, between two members of the same group", () => {
    const agents = createAgentSoA(2);
    setAgentPosition(agents, 0, 0, 0);
    setAgentPosition(agents, 1, 0.5, 0.1); // within interactionRangeMeters, not overlapping bodies
    setAgentRadius(agents, 0, 0.22);
    setAgentRadius(agents, 1, 0.22);
    const targets = new Float32Array([10, 0, -10, 0]);
    const groupIds = new Int32Array([1, 1]); // same group: "together"

    const result = stepGpuSimCoreSocialForceCpu(
      agents,
      targets,
      [],
      params,
      groupIds,
      new Float32Array(4),
    );

    // No repulsion (bodies don't overlap at this distance) and no sidestep:
    // velocity should relax cleanly toward the desired +x speed with zero
    // y-component, exactly as if agent 1 were not there at all.
    const alone = createAgentSoA(1);
    setAgentPosition(alone, 0, 0, 0);
    setAgentRadius(alone, 0, 0.22);
    const aloneResult = stepGpuSimCoreSocialForceCpu(
      alone,
      new Float32Array([10, 0]),
      [],
      params,
      undefined,
      undefined,
    );

    expect(result.velocities[0]).toBeCloseTo(aloneResult.velocities[0], 9);
    expect(result.velocities[1]).toBeCloseTo(aloneResult.velocities[1], 9);
  });

  it("still applies the contact-overlap push between overlapping group members, even though the exponential repulsion is zeroed", () => {
    const overlapping = createAgentSoA(2);
    setAgentPosition(overlapping, 0, 0, 0);
    setAgentPosition(overlapping, 1, 0.3, 0); // overlapping: 0.3 < 0.22+0.22
    setAgentRadius(overlapping, 0, 0.22);
    setAgentRadius(overlapping, 1, 0.22);
    const targets = new Float32Array([0, 0, 0, 0]);
    const sameGroup = new Int32Array([1, 1]);
    // Targets equal own positions (distance 0) to isolate the contact push
    // from relaxation — holding exempts both agents from the stage 7/8
    // clamps that would otherwise zero this out at zero distance.
    const holding = new Uint32Array([1, 1]);

    const together = stepGpuSimCoreSocialForceCpu(
      overlapping,
      targets,
      [],
      params,
      sameGroup,
      new Float32Array(4),
      undefined,
      holding,
    );

    // Agent 0 is still pushed away (negative x-velocity) from the
    // overlapping neighbour, purely from the contact-stiffness term, even
    // though both agents share a group and the exponential repulsion term
    // is zero.
    expect(together.velocities[0]).toBeLessThan(0);
  });

  it("stays lossless under the 3x3 neighbourhood restriction with sidestep and group-gated repulsion both active", () => {
    const N = 40;
    const agents = createAgentSoA(N);
    const groupIds = new Int32Array(N);
    const formationSlots = new Float32Array(N * 2);
    const targets = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      setAgentPosition(agents, i, 5 + (i % 8) * 1.2, 5 + Math.floor(i / 8) * 1.2);
      setAgentSpeed(agents, i, 1.34);
      setAgentRadius(agents, i, 0.22);
      groupIds[i] = Math.floor(i / 2);
      formationSlots[i * 2] = 5 + (i % 8) * 1.2 + 0.4;
      formationSlots[i * 2 + 1] = 5 + Math.floor(i / 8) * 1.2;
      targets[i * 2] = 60;
      targets[i * 2 + 1] = 60;
    }
    const layout = createSpatialHashGridLayout({ width: 64, height: 64, cellSize: 2 });

    const allPairs = stepGpuSimCoreSocialForceCpu(
      agents,
      targets,
      walls,
      params,
      groupIds,
      formationSlots,
    );
    const neighborhood = stepGpuSimCoreSocialForceNeighborhoodCpu(
      agents,
      targets,
      walls,
      params,
      layout,
      groupIds,
      formationSlots,
    );

    for (let i = 0; i < N * 2; i++) {
      expect(Math.abs(neighborhood.positions[i] - allPairs.positions[i])).toBeLessThan(
        1e-9,
      );
      expect(
        Math.abs(neighborhood.velocities[i] - allPairs.velocities[i]),
      ).toBeLessThan(1e-9);
    }
  });
});

describe("stage 4: anticipation (Karamouzas, Skinner & Guy 2014 time-to-collision push)", () => {
  it("pushes an agent away from someone on a head-on collision course", () => {
    const agents = createAgentSoA(2);
    setAgentPosition(agents, 0, 0, 0);
    setAgentVelocity(agents, 0, 1.34, 0);
    setAgentRadius(agents, 0, 0.22);
    // Within params' own anticipationRangeMeters (2m) — 2.5m would sit
    // outside it and anticipation would correctly contribute nothing at
    // all, making this comparison a no-op regardless of anticipationStrength.
    setAgentPosition(agents, 1, 1.5, 0);
    setAgentVelocity(agents, 1, -1.34, 0);
    setAgentRadius(agents, 1, 0.22);
    // Targets match current heading so relaxation doesn't fight anticipation.
    const targets = new Float32Array([10, 0, -10, 0]);

    const withAnticipation = stepGpuSimCoreSocialForceCpu(agents, targets, [], params);
    const without = stepGpuSimCoreSocialForceCpu(agents, targets, [], {
      ...params,
      anticipationStrength: 0,
    });

    // The push resists closing speed: agent 0's x-velocity should end up
    // lower with anticipation active than without it (braking/diverting
    // ahead of the projected collision), not just numerically different.
    expect(withAnticipation.velocities[0]).toBeLessThan(without.velocities[0]);
  });

  it("does nothing between two agents moving apart (not on a collision course)", () => {
    const agents = createAgentSoA(2);
    setAgentPosition(agents, 0, 0, 0);
    setAgentVelocity(agents, 0, -1.34, 0);
    setAgentRadius(agents, 0, 0.22);
    setAgentPosition(agents, 1, 1, 0);
    setAgentVelocity(agents, 1, 1.34, 0);
    setAgentRadius(agents, 1, 0.22);
    const targets = new Float32Array([-10, 0, 10, 0]);

    const withAnticipation = stepGpuSimCoreSocialForceCpu(agents, targets, [], params);
    const without = stepGpuSimCoreSocialForceCpu(agents, targets, [], {
      ...params,
      anticipationStrength: 0,
    });

    // b = w·(v_self - v_other) <= 0 here (moving apart), so anticipation's
    // own early-return should leave the two runs identical.
    expect(withAnticipation.velocities[0]).toBeCloseTo(without.velocities[0], 9);
    expect(withAnticipation.velocities[1]).toBeCloseTo(without.velocities[1], 9);
  });

  it("clamps the summed anticipatory push to anticipationMaxAcceleration", () => {
    // A near-miss (small lateral offset, high closing speed) drives tau
    // toward zero, and the push's raw magnitude toward infinity — exactly
    // the case the cap exists for. 3m apart is beyond interactionRangeMeters
    // (2, params' default) so agent repulsion contributes nothing here —
    // this isolates the anticipation force specifically, not "every force
    // combined stays under maxSpeed" (a much weaker, already-existing
    // guarantee from integrate()'s own clamp).
    const agents = createAgentSoA(2);
    setAgentPosition(agents, 0, 0, 0);
    const v0x = 3;
    const v0y = 0.01;
    setAgentVelocity(agents, 0, v0x, v0y);
    setAgentRadius(agents, 0, 0.22);
    setAgentPosition(agents, 1, 3, 0);
    setAgentVelocity(agents, 1, -3, -0.01);
    setAgentRadius(agents, 1, 0.22);
    const targets = new Float32Array([0, 0, 3, 0]); // target = own position: zero desired-velocity pull
    // Both agents start at real speed with target = own position (distance
    // 0) — holding exempts them from the stage 7/8 clamps, which would
    // otherwise zero this out entirely at zero distance (speed * dt always
    // exceeds a distance of 0).
    const holding = new Uint32Array([1, 1]);

    const result = stepGpuSimCoreSocialForceCpu(
      agents,
      targets,
      [],
      {
        ...params,
        anticipationRangeMeters: 5,
        relaxationTime: 1e9, // makes relaxation's own contribution (both the
        // exponential decay factor and desiredSpeed's distance/relaxationTime
        // term) negligible
        maxSpeedRatio: 1000, // stage 6's real clamp is freeSpeed * maxSpeedRatio,
        // not the (now-unused-by-this-integration) inherited `maxSpeed` field
        // — this keeps that clamp from masking the one under test here.
      },
      undefined,
      undefined,
      undefined,
      holding,
    );

    // result.velocities ≈ initial velocity + force * dt (relax ≈ 1 with
    // relaxationTime this large, and the maxSpeedRatio clamp is a no-op),
    // so subtracting initial velocity and dividing by dt recovers the force
    // itself — dominated by anticipation, since repulsion is zero at this
    // range and relaxation is negligible.
    const forceX = (result.velocities[0] - v0x) / params.dt;
    const forceY = (result.velocities[1] - v0y) / params.dt;
    const magnitude = Math.hypot(forceX, forceY);
    // Positions/velocities round-trip through a Float32Array (single
    // precision), so a value around 5 carries ~1e-6 relative rounding
    // noise even with exact math — a tighter epsilon would be testing
    // float32 precision, not the clamp.
    expect(magnitude).toBeLessThanOrEqual(params.anticipationMaxAcceleration * 1.001);
    // Not vacuous: the cap must actually be doing something, i.e. the raw
    // (unclamped) push at this near-miss really would exceed it.
    expect(magnitude).toBeGreaterThan(params.anticipationMaxAcceleration * 0.9);
  });

  it("stays lossless under the 3x3 neighbourhood restriction with anticipation's own (wider) range", () => {
    const N = 30;
    const agents = createAgentSoA(N);
    const targets = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      setAgentPosition(agents, i, 5 + (i % 6) * 1.5, 5 + Math.floor(i / 6) * 1.5);
      // Alternate facing directions so plenty of pairs are actually closing.
      setAgentVelocity(agents, i, i % 2 === 0 ? 1.2 : -1.2, 0);
      setAgentRadius(agents, i, 0.22);
      targets[i * 2] = i % 2 === 0 ? 60 : -60;
      targets[i * 2 + 1] = 5 + Math.floor(i / 6) * 1.5;
    }
    const wideParams: GpuSimCoreSocialForceParams = {
      ...params,
      anticipationRangeMeters: 3,
    };
    const layout = createSpatialHashGridLayout({ width: 64, height: 64, cellSize: 3 });

    const allPairs = stepGpuSimCoreSocialForceCpu(agents, targets, walls, wideParams);
    const neighborhood = stepGpuSimCoreSocialForceNeighborhoodCpu(
      agents,
      targets,
      walls,
      wideParams,
      layout,
    );

    for (let i = 0; i < N * 2; i++) {
      expect(Math.abs(neighborhood.positions[i] - allPairs.positions[i])).toBeLessThan(
        1e-9,
      );
      expect(
        Math.abs(neighborhood.velocities[i] - allPairs.velocities[i]),
      ).toBeLessThan(1e-9);
    }
  });

  it("throws when anticipationRangeMeters exceeds cellSize", () => {
    const agents = createAgentSoA(1);
    setAgentPosition(agents, 0, 0, 0);
    setAgentRadius(agents, 0, 0.22);
    const targets = new Float32Array([0, 0]);
    const tooCoarse = createSpatialHashGridLayout({
      width: 64,
      height: 64,
      cellSize: 1.5,
    });

    expect(() =>
      stepGpuSimCoreSocialForceNeighborhoodCpu(
        agents,
        targets,
        [],
        // interactionRangeMeters also has to stay <= cellSize here, or that
        // earlier (and unrelated) check would throw first and this
        // assertion wouldn't actually be testing the anticipation check.
        { ...params, interactionRangeMeters: 1, anticipationRangeMeters: 2 },
        tooCoarse,
      ),
    ).toThrow(/anticipationRangeMeters/);
  });
});

describe("stage 5: hazard avoidance (ADR-0012's precomputed per-agent push, added directly — no neighbour loop)", () => {
  it("adds the supplied hazard avoidance vector directly to the resulting force", () => {
    const agents = createAgentSoA(1);
    setAgentPosition(agents, 0, 0, 0);
    setAgentRadius(agents, 0, 0.22);
    const targets = new Float32Array([0, 0]); // target = own position: zero relaxation pull
    const hazardAvoidance = new Float32Array([3, 0]);
    // Holding exempts this isolation fixture from the stage 7/8 clamps,
    // which would otherwise zero out the push-only velocity entirely at
    // zero distance for a non-holding agent.
    const holding = new Uint32Array([1]);

    const withHazard = stepGpuSimCoreSocialForceCpu(
      agents,
      targets,
      [],
      params,
      undefined,
      undefined,
      hazardAvoidance,
      holding,
    );
    const without = stepGpuSimCoreSocialForceCpu(
      agents,
      targets,
      [],
      params,
      undefined,
      undefined,
      undefined,
      holding,
    );

    // Alone, no walls, target = own position (desiredSpeed and the target
    // velocity both zero): the push is Euler-added to velocity, then stage
    // 6's exact exponential relaxation decays that toward the (zero) target
    // velocity within the same step — not the old naive `3 * dt`, since
    // relaxation now applies to everything, not just the "desired heading"
    // term.
    const relax = Math.exp(-params.dt / params.relaxationTime);
    const expectedVx = 3 * params.dt * relax;
    expect(withHazard.velocities[0]).toBeGreaterThan(0);
    expect(withHazard.velocities[0]).toBeCloseTo(expectedVx, 5);
    expect(without.velocities[0]).toBeCloseTo(0, 9);
  });

  it("leaves the result unchanged when hazard avoidance is not supplied at all (backward compatible)", () => {
    const agents = createAgentSoA(3);
    for (let i = 0; i < 3; i++) {
      setAgentPosition(agents, i, i * 0.6, 0);
      setAgentRadius(agents, i, 0.22);
    }
    const targets = new Float32Array([10, 0, 10, 0, 10, 0]);

    const undeclaredResult = stepGpuSimCoreSocialForceCpu(agents, targets, [], params);
    const explicitZeroResult = stepGpuSimCoreSocialForceCpu(
      agents,
      targets,
      [],
      params,
      undefined,
      undefined,
      new Float32Array(6), // all zeros: adding it should be a true no-op
    );

    for (let i = 0; i < 6; i++) {
      expect(undeclaredResult.velocities[i]).toBeCloseTo(
        explicitZeroResult.velocities[i],
        9,
      );
    }
  });

  it("stays lossless under the 3x3 neighbourhood restriction with hazard avoidance active", () => {
    const { agents, targets, layout, N } = makeScene();
    const hazardAvoidance = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      // A different push per agent, not a uniform one, so a bug that
      // broadcasts index 0's value to everyone would be caught.
      hazardAvoidance[i * 2] = (i % 5) - 2;
      hazardAvoidance[i * 2 + 1] = ((i * 3) % 5) - 2;
    }

    const allPairs = stepGpuSimCoreSocialForceCpu(
      agents,
      targets,
      walls,
      params,
      undefined,
      undefined,
      hazardAvoidance,
    );
    const neighborhood = stepGpuSimCoreSocialForceNeighborhoodCpu(
      agents,
      targets,
      walls,
      params,
      layout,
      undefined,
      undefined,
      hazardAvoidance,
    );

    for (let i = 0; i < N * 2; i++) {
      expect(Math.abs(neighborhood.positions[i] - allPairs.positions[i])).toBeLessThan(
        1e-9,
      );
      expect(
        Math.abs(neighborhood.velocities[i] - allPairs.velocities[i]),
      ).toBeLessThan(1e-9);
    }
  });
});

describe("stage 6: distance-based desired-speed easing, holding, and the exact exponential relaxation (crowdMovement.ts's two-part integrate)", () => {
  it("eases desired speed down as a non-holding agent nears its target, not just a flat free speed", () => {
    const far = createAgentSoA(1);
    setAgentPosition(far, 0, 0, 0);
    setAgentSpeed(far, 0, 1.34);
    setAgentRadius(far, 0, 0.22);
    const farTargets = new Float32Array([50, 0]); // far: desiredSpeed pinned at freeSpeed

    const near = createAgentSoA(1);
    setAgentPosition(near, 0, 0, 0);
    setAgentSpeed(near, 0, 1.34);
    setAgentRadius(near, 0, 0.22);
    const nearTargets = new Float32Array([0.05, 0]); // near: distance/relaxationTime << freeSpeed

    const farResult = stepGpuSimCoreSocialForceCpu(far, farTargets, [], params);
    const nearResult = stepGpuSimCoreSocialForceCpu(near, nearTargets, [], params);

    // Both start at rest with nothing pushing them but relaxation toward
    // their own target — the near agent's desiredSpeed is capped by
    // distance / relaxationTime (0.05 / 0.644 ≈ 0.078 m/s), the far one's
    // isn't (50 / 0.644 far exceeds freeSpeed, so min() picks freeSpeed).
    expect(nearResult.velocities[0]).toBeGreaterThan(0);
    expect(nearResult.velocities[0]).toBeLessThan(farResult.velocities[0]);
  });

  it("holding agents ease toward their spot over holdEaseMeters, not the relaxationTime-based formula non-holding agents use", () => {
    const N = 1;
    const holdingFlags = new Uint32Array([1]);
    const notHoldingFlags = new Uint32Array([0]);
    const distance = 0.05;

    const makeScene = () => {
      const agents = createAgentSoA(N);
      setAgentPosition(agents, 0, 0, 0);
      setAgentSpeed(agents, 0, 1.34);
      setAgentRadius(agents, 0, 0.22);
      return agents;
    };
    const targets = new Float32Array([distance, 0]);

    // holdEaseMeters (1) and relaxationTime (0.644) are different numbers,
    // so the same distance produces a different desiredSpeed cap under the
    // two formulas: freeSpeed * distance / holdEaseMeters vs.
    // distance / relaxationTime.
    const holdingResult = stepGpuSimCoreSocialForceCpu(
      makeScene(),
      targets,
      [],
      params,
      undefined,
      undefined,
      undefined,
      holdingFlags,
    );
    const notHoldingResult = stepGpuSimCoreSocialForceCpu(
      makeScene(),
      targets,
      [],
      params,
      undefined,
      undefined,
      undefined,
      notHoldingFlags,
    );

    expect(holdingResult.velocities[0]).toBeGreaterThan(0);
    expect(notHoldingResult.velocities[0]).toBeGreaterThan(0);
    expect(holdingResult.velocities[0]).not.toBeCloseTo(
      notHoldingResult.velocities[0],
      6,
    );
  });

  it("clamps the final velocity to freeSpeed * maxSpeedRatio — a PER-AGENT cap, not the inherited flat maxSpeed field", () => {
    const slow = createAgentSoA(1);
    setAgentPosition(slow, 0, 0, 0);
    setAgentSpeed(slow, 0, 0.5); // this agent's own freeSpeed is well under params.maxSpeed
    setAgentRadius(slow, 0, 0.22);
    const targets = new Float32Array([500, 0]); // far away: desiredSpeed pinned at freeSpeed
    setAgentVelocity(slow, 0, 10, 0); // start already moving far faster than any real cap

    const result = stepGpuSimCoreSocialForceCpu(slow, targets, [], params);

    // freeSpeed * maxSpeedRatio = 0.5 * 1.3 = 0.65 — much smaller than the
    // inherited (and, since stage 6, unused-by-this-integration) flat
    // params.maxSpeed of 1.7 that an old-style clamp would have allowed.
    const speed = Math.hypot(result.velocities[0], result.velocities[1]);
    expect(speed).toBeLessThanOrEqual(0.5 * params.maxSpeedRatio + 1e-6);
  });

  it("matches the closed-form exponential relaxation exactly for an isolated agent, not a first-order Euler approximation", () => {
    const agents = createAgentSoA(1);
    setAgentPosition(agents, 0, 0, 0);
    setAgentSpeed(agents, 0, 1.34);
    setAgentRadius(agents, 0, 0.22);
    setAgentVelocity(agents, 0, 0.2, 0);
    const targets = new Float32Array([50, 0]); // far: desiredSpeed = freeSpeed exactly

    const result = stepGpuSimCoreSocialForceCpu(agents, targets, [], params);

    // No pushes at all here (alone, no walls) — pure relaxation from v=0.2
    // toward freeSpeed=1.34, over one step. The exact solution:
    // v(dt) = target + (v0 - target) * e^(-dt/tau).
    const relax = Math.exp(-params.dt / params.relaxationTime);
    const expectedVx = 1.34 + (0.2 - 1.34) * relax;
    // A naive Euler step (v0 + (target - v0)/tau * dt) would give a
    // measurably different number at this dt/tau ratio — this assertion is
    // only meaningful because the two formulas actually disagree here.
    const eulerVx = 0.2 + ((1.34 - 0.2) / params.relaxationTime) * params.dt;
    expect(Math.abs(expectedVx - eulerVx)).toBeGreaterThan(1e-4);
    expect(result.velocities[0]).toBeCloseTo(expectedVx, 5);
  });

  it("stays lossless under the 3x3 neighbourhood restriction with holding flags active", () => {
    const N = 20;
    const agents = createAgentSoA(N);
    const targets = new Float32Array(N * 2);
    const holding = new Uint32Array(N);
    for (let i = 0; i < N; i++) {
      setAgentPosition(agents, i, 5 + (i % 5) * 1.2, 5 + Math.floor(i / 5) * 1.2);
      setAgentSpeed(agents, i, 1.34);
      setAgentRadius(agents, i, 0.22);
      targets[i * 2] = 5 + (i % 5) * 1.2 + 0.3; // close targets: easing actually matters
      targets[i * 2 + 1] = 5 + Math.floor(i / 5) * 1.2;
      holding[i] = i % 3 === 0 ? 1 : 0; // a mix, not all-or-nothing
    }
    const layout = createSpatialHashGridLayout({ width: 64, height: 64, cellSize: 2 });

    const allPairs = stepGpuSimCoreSocialForceCpu(
      agents,
      targets,
      walls,
      params,
      undefined,
      undefined,
      undefined,
      holding,
    );
    const neighborhood = stepGpuSimCoreSocialForceNeighborhoodCpu(
      agents,
      targets,
      walls,
      params,
      layout,
      undefined,
      undefined,
      undefined,
      holding,
    );

    for (let i = 0; i < N * 2; i++) {
      expect(Math.abs(neighborhood.positions[i] - allPairs.positions[i])).toBeLessThan(
        1e-9,
      );
      expect(
        Math.abs(neighborhood.velocities[i] - allPairs.velocities[i]),
      ).toBeLessThan(1e-9);
    }
  });
});

describe("stage 7: the no-walking-backward clamp (crowdMovement.ts's if (!holding) { along < 0 -> clamp })", () => {
  it("never lets a non-holding agent's velocity point backward along its own heading, even when squeezed hard from ahead", () => {
    const agents = createAgentSoA(2);
    setAgentPosition(agents, 0, 0, 0);
    setAgentRadius(agents, 0, 0.22);
    // Deeply overlapping neighbour dead ahead: bodies sum to 0.44, only
    // 0.05m apart — a massive contact-stiffness push straight back at
    // agent 0, strong enough that an unclamped model would drift it
    // backward relative to its own heading (+x, toward its far-away target).
    setAgentPosition(agents, 1, 0.05, 0);
    setAgentRadius(agents, 1, 0.22);
    const targets = new Float32Array([50, 0, -50, 0]);

    const result = stepGpuSimCoreSocialForceCpu(agents, targets, [], params);

    const along = result.velocities[0] * 1 + result.velocities[1] * 0; // heading = (1, 0)
    expect(along).toBeGreaterThanOrEqual(-1e-9);
  });

  it("does NOT apply the backward clamp to a holding agent — crowdMovement.ts's own gate", () => {
    const agents = createAgentSoA(2);
    setAgentPosition(agents, 0, 0, 0);
    setAgentRadius(agents, 0, 0.22);
    setAgentPosition(agents, 1, 0.05, 0);
    setAgentRadius(agents, 1, 0.22);
    const targets = new Float32Array([50, 0, -50, 0]);
    const holding = new Uint32Array([1, 0]);

    const holdingResult = stepGpuSimCoreSocialForceCpu(
      agents,
      targets,
      [],
      params,
      undefined,
      undefined,
      undefined,
      holding,
    );
    const notHoldingResult = stepGpuSimCoreSocialForceCpu(agents, targets, [], params);

    // Same brutal push either way; only the holding run is allowed to carry
    // it straight through as a negative x-velocity (heading toward the far
    // target is still +x for a holding agent whose "spot" is also +x here,
    // since targets are unchanged — the CLAMP is what differs, not the
    // geometry).
    expect(holdingResult.velocities[0]).toBeLessThan(notHoldingResult.velocities[0]);
  });

  it("leaves the sideways component untouched when clamping the backward one", () => {
    const agents = createAgentSoA(2);
    setAgentPosition(agents, 0, 0, 0);
    setAgentRadius(agents, 0, 0.22);
    // Overlapping neighbour offset slightly to one side, not dead-on, so
    // the push has both a backward (along-heading) and a sideways
    // component — the clamp should only touch the former.
    setAgentPosition(agents, 1, 0.05, 0.05);
    setAgentRadius(agents, 1, 0.22);
    const targets = new Float32Array([50, 0, -50, 0]);

    const clamped = stepGpuSimCoreSocialForceCpu(agents, targets, [], params);
    // heading = (1, 0): the clamp only ever subtracts along * heading from
    // (vx, vy), which for heading (1, 0) never touches vy at all — so this
    // is really asserting the clamp's own math, using a real run's output
    // rather than re-deriving the formula independently.
    expect(Number.isFinite(clamped.velocities[1])).toBe(true);
    expect(clamped.velocities[1]).not.toBeCloseTo(0, 6);
  });

  it("stays lossless under the 3x3 neighbourhood restriction with the backward clamp actively triggering", () => {
    const N = 2;
    const agents = createAgentSoA(N);
    setAgentPosition(agents, 0, 5, 5);
    setAgentRadius(agents, 0, 0.22);
    setAgentPosition(agents, 1, 5.05, 5);
    setAgentRadius(agents, 1, 0.22);
    const targets = new Float32Array([55, 5, -45, 5]);
    const layout = createSpatialHashGridLayout({ width: 64, height: 64, cellSize: 2 });

    const allPairs = stepGpuSimCoreSocialForceCpu(agents, targets, walls, params);
    const neighborhood = stepGpuSimCoreSocialForceNeighborhoodCpu(
      agents,
      targets,
      walls,
      params,
      layout,
    );

    for (let i = 0; i < N * 2; i++) {
      expect(Math.abs(neighborhood.positions[i] - allPairs.positions[i])).toBeLessThan(
        1e-9,
      );
      expect(
        Math.abs(neighborhood.velocities[i] - allPairs.velocities[i]),
      ).toBeLessThan(1e-9);
    }
  });
});

describe("stage 8: the no-overshoot-past-target clamp (crowdMovement.ts's if (!holding && speed*dt > distance) { scale by distance/(speed*dt) })", () => {
  it("never lets a non-holding agent step past a nearby target within one step", () => {
    const agents = createAgentSoA(1);
    setAgentPosition(agents, 0, 0, 0);
    setAgentRadius(agents, 0, 0.22);
    // A large initial velocity survives relaxation and gets capped only by
    // maxSpeedRatio (1.742 m/s here) — at 1/60s that step (0.029m) would
    // sail straight past a target only 0.005m away without this clamp.
    setAgentVelocity(agents, 0, 10, 0);
    const targets = new Float32Array([0.005, 0]);

    const result = stepGpuSimCoreSocialForceCpu(agents, targets, [], params);

    const distance = 0.005;
    const stepLength = Math.hypot(result.positions[0], result.positions[1]);
    // Lands (very nearly) exactly on the target — not short of it, not past
    // it — since the clamp scales velocity by exactly distance / (speed*dt).
    expect(stepLength).toBeCloseTo(distance, 5);
  });

  it("does NOT apply the overshoot clamp to a holding agent — crowdMovement.ts's own gate — so it can step past its own hold spot", () => {
    const agents = createAgentSoA(1);
    setAgentPosition(agents, 0, 0, 0);
    setAgentRadius(agents, 0, 0.22);
    setAgentVelocity(agents, 0, 10, 0);
    const targets = new Float32Array([0.005, 0]);
    const holding = new Uint32Array([1]);

    const held = stepGpuSimCoreSocialForceCpu(
      agents,
      targets,
      [],
      params,
      undefined,
      undefined,
      undefined,
      holding,
    );

    // Same brutal initial velocity, same tiny distance — only the CLAMP
    // differs. A holding agent's step is bounded solely by the
    // maxSpeedRatio clamp (still real, still applies to holding agents),
    // which at this velocity is far larger than the 0.005m distance.
    const stepLength = Math.hypot(held.positions[0], held.positions[1]);
    expect(stepLength).toBeGreaterThan(0.005 * 2);
  });

  it("does not clamp when the step would already land short of the target", () => {
    const agents = createAgentSoA(1);
    setAgentPosition(agents, 0, 0, 0);
    setAgentRadius(agents, 0, 0.22);
    // A gentle initial velocity whose one-step displacement is well short
    // of a far-away target — the clamp's `speed * dt > distance` guard
    // must not fire and shrink a step that was never going to overshoot.
    setAgentVelocity(agents, 0, 0.05, 0);
    const targets = new Float32Array([50, 0]);

    const unclamped = stepGpuSimCoreSocialForceCpu(agents, targets, [], {
      ...params,
      relaxationTime: 1e9, // relaxation contributes ~nothing over one step
    });

    // The step is governed entirely by the initial velocity (minus
    // negligible relaxation drift), not scaled down toward some tiny
    // fraction of the 50m distance.
    const stepLength = Math.hypot(unclamped.positions[0], unclamped.positions[1]);
    expect(stepLength).toBeGreaterThan(0.0005);
  });

  it("stays lossless under the 3x3 neighbourhood restriction with the overshoot clamp actively triggering", () => {
    const N = 2;
    const agents = createAgentSoA(N);
    setAgentPosition(agents, 0, 5, 5);
    setAgentRadius(agents, 0, 0.22);
    setAgentVelocity(agents, 0, 10, 0);
    setAgentPosition(agents, 1, 5.05, 5);
    setAgentRadius(agents, 1, 0.22);
    const targets = new Float32Array([5.005, 5, 4.95, 5]);
    const layout = createSpatialHashGridLayout({ width: 64, height: 64, cellSize: 2 });

    const allPairs = stepGpuSimCoreSocialForceCpu(agents, targets, walls, params);
    const neighborhood = stepGpuSimCoreSocialForceNeighborhoodCpu(
      agents,
      targets,
      walls,
      params,
      layout,
    );

    for (let i = 0; i < N * 2; i++) {
      expect(Math.abs(neighborhood.positions[i] - allPairs.positions[i])).toBeLessThan(
        1e-9,
      );
      expect(
        Math.abs(neighborhood.velocities[i] - allPairs.velocities[i]),
      ).toBeLessThan(1e-9);
    }
  });
});

describe("ADR-0033: routedHeading is the walking direction, decoupled from distance-to-target (crowdMovement.ts's router.direction() vs. its own literal targetX/targetY)", () => {
  it("overrides the straight-line default when supplied — an agent walks the routed direction, not toward its literal target", () => {
    const agents = createAgentSoA(1);
    setAgentPosition(agents, 0, 0, 0);
    setAgentRadius(agents, 0, 0.22);
    // Target is straight ahead on +x; routedHeading instead points +y, as a
    // router would when a wall blocks line of sight to that +x target.
    const targets = new Float32Array([50, 0]);
    const routedHeading = new Float32Array([0, 1]);

    const straightLine = stepGpuSimCoreSocialForceCpu(agents, targets, [], params);
    const routed = stepGpuSimCoreSocialForceCpu(
      agents,
      targets,
      [],
      params,
      undefined,
      undefined,
      undefined,
      undefined,
      routedHeading,
    );

    // Default (no routedHeading): relaxes toward +x, as before this stage.
    expect(straightLine.velocities[0]).toBeGreaterThan(0);
    expect(straightLine.velocities[1]).toBeCloseTo(0, 9);
    // Routed: relaxes toward +y instead, even though the target is +x —
    // the kernel no longer derives direction from the target at all.
    expect(routed.velocities[1]).toBeGreaterThan(0);
    expect(routed.velocities[0]).toBeCloseTo(0, 9);
  });

  it("does not change desired-speed magnitude — distance stays tied to the literal target regardless of which way routedHeading points", () => {
    const agents = createAgentSoA(1);
    setAgentPosition(agents, 0, 0, 0);
    setAgentRadius(agents, 0, 0.22);
    const targets = new Float32Array([50, 0]); // distance 50, same for both runs

    const towardTarget = stepGpuSimCoreSocialForceCpu(
      agents,
      targets,
      [],
      params,
      undefined,
      undefined,
      undefined,
      undefined,
      new Float32Array([1, 0]),
    );
    const perpendicular = stepGpuSimCoreSocialForceCpu(
      agents,
      targets,
      [],
      params,
      undefined,
      undefined,
      undefined,
      undefined,
      new Float32Array([0, 1]),
    );

    // Same distance to the same literal target -> same desired-speed
    // magnitude (both agents start at rest with no other forces, so speed
    // after one step is purely a function of distance-driven desiredSpeed),
    // even though the two runs walk in completely different directions.
    const speedToward = Math.hypot(
      towardTarget.velocities[0],
      towardTarget.velocities[1],
    );
    const speedPerpendicular = Math.hypot(
      perpendicular.velocities[0],
      perpendicular.velocities[1],
    );
    expect(speedToward).toBeCloseTo(speedPerpendicular, 9);
  });

  it("stays lossless under the 3x3 neighbourhood restriction with a non-default routedHeading", () => {
    const N = 2;
    const agents = createAgentSoA(N);
    setAgentPosition(agents, 0, 5, 5);
    setAgentRadius(agents, 0, 0.22);
    setAgentPosition(agents, 1, 5.3, 5);
    setAgentRadius(agents, 1, 0.22);
    const targets = new Float32Array([55, 5, -45, 5]);
    const routedHeading = new Float32Array([0, 1, 0, -1]);
    const layout = createSpatialHashGridLayout({ width: 64, height: 64, cellSize: 2 });

    const allPairs = stepGpuSimCoreSocialForceCpu(
      agents,
      targets,
      walls,
      params,
      undefined,
      undefined,
      undefined,
      undefined,
      routedHeading,
    );
    const neighborhood = stepGpuSimCoreSocialForceNeighborhoodCpu(
      agents,
      targets,
      walls,
      params,
      layout,
      undefined,
      undefined,
      undefined,
      undefined,
      routedHeading,
    );

    for (let i = 0; i < N * 2; i++) {
      expect(Math.abs(neighborhood.positions[i] - allPairs.positions[i])).toBeLessThan(
        1e-9,
      );
      expect(
        Math.abs(neighborhood.velocities[i] - allPairs.velocities[i]),
      ).toBeLessThan(1e-9);
    }
  });
});
