import { describe, expect, it } from "vitest";
import {
  createAgentSoA,
  createSpatialHashGridLayout,
  setAgentPosition,
  setAgentRadius,
  setAgentSpeed,
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
