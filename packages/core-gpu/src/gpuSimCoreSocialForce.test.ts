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
    // formation spring itself.
    const agents = createAgentSoA(1);
    setAgentPosition(agents, 0, 0, 0);
    setAgentRadius(agents, 0, 0.22);
    const targets = new Float32Array([0, 0]);
    const groupIds = new Int32Array([1]);
    const formationSlots = new Float32Array([2, 0]);

    const result = stepGpuSimCoreSocialForceCpu(
      agents,
      targets,
      [],
      params,
      groupIds,
      formationSlots,
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

    const resultOne = stepGpuSimCoreSocialForceCpu(
      oneStranger,
      targetsOne,
      [],
      params,
      groupIdsOne,
      formationSlots,
    );
    const resultTwo = stepGpuSimCoreSocialForceCpu(
      twoStrangers,
      targetsTwo,
      [],
      params,
      groupIdsTwo,
      formationSlots,
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

    const together = stepGpuSimCoreSocialForceCpu(
      overlapping,
      targets,
      [],
      params,
      sameGroup,
      new Float32Array(4),
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

    const result = stepGpuSimCoreSocialForceCpu(agents, targets, [], {
      ...params,
      anticipationRangeMeters: 5,
      relaxationTime: 1e9, // makes relaxation's own contribution negligible
      maxSpeed: 1000, // keeps integrate()'s own clamp from masking this one
    });

    // result.velocities = initial velocity + force * dt (clampMagnitude is a
    // no-op at maxSpeed: 1000), so subtracting initial velocity and dividing
    // by dt recovers the force itself — dominated by anticipation, since
    // repulsion is zero at this range and relaxation is negligible.
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
