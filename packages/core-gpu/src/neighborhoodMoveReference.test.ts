import { describe, expect, it } from "vitest";
import {
  createAgentSoA,
  createSpatialHashGridLayout,
  setAgentPosition,
  setAgentSpeed,
  stepSocialForceCpu,
  type SocialForceParams,
  type WallSegment,
} from "./index";
import { stepSocialForceNeighborhoodCpu } from "./neighborhoodMoveReference";

const params: SocialForceParams = {
  dt: 1 / 60,
  desiredSpeed: 1.3,
  relaxationTime: 0.5,
  agentRepulsionStrength: 2,
  agentRepulsionRange: 1.5,
  wallRepulsionStrength: 2,
  wallRepulsionRange: 1.0,
  maxSpeed: 2.0,
};
const walls: WallSegment[] = [{ x1: 0, y1: 0, x2: 64, y2: 0 }];

function makeScene() {
  const N = 256;
  const agents = createAgentSoA(N);
  for (let i = 0; i < N; i++) {
    setAgentPosition(agents, i, 5 + (i % 16) * 2, 5 + Math.floor(i / 16) * 2);
    setAgentSpeed(agents, i, 1.3);
  }
  const targets = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    targets[i * 2] = 60;
    targets[i * 2 + 1] = 60;
  }
  // cellSize >= agentRepulsionRange so the 3x3 neighborhood is lossless.
  const layout = createSpatialHashGridLayout({ width: 64, height: 64, cellSize: 2 });
  return { agents, targets, layout, N };
}

describe("stepSocialForceNeighborhoodCpu equals all-pairs when range <= cellSize", () => {
  it("matches a single all-pairs step (force-set identical, reorder only)", () => {
    const { agents, targets, layout, N } = makeScene();
    const allPairs = stepSocialForceCpu(agents, targets, walls, params);
    const neighborhood = stepSocialForceNeighborhoodCpu(
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
      const ap = stepSocialForceCpu(allPairs, targets, walls, params);
      const nb = stepSocialForceNeighborhoodCpu(
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

  it("throws when agentRepulsionRange exceeds cellSize", () => {
    const { agents, targets } = makeScene();
    const tooCoarse = createSpatialHashGridLayout({
      width: 64,
      height: 64,
      cellSize: 1,
    });
    expect(() =>
      stepSocialForceNeighborhoodCpu(agents, targets, walls, params, tooCoarse),
    ).toThrow(/cellSize/);
  });
});
