import { describe, expect, it } from "vitest";
import {
  accumulateDensityCpu,
  accumulateDensityGpu,
  buildSpatialHashGridCpu,
  buildSpatialHashGridGpu,
  createAgentSoA,
  createFlowFieldCpu,
  createSpatialHashGridLayout,
  rasterizeWallsToBlockedCells,
  sampleFlowFieldGpu,
  setAgentPosition,
  setAgentVelocity,
  stepSocialForceCpu,
  stepSocialForceGpu,
  type SocialForceParams,
  type WallSegment,
} from "./index";

function createProbeAgents() {
  const agents = createAgentSoA(4);

  setAgentPosition(agents, 0, 1, 1);
  setAgentPosition(agents, 1, 11, 1);
  setAgentPosition(agents, 2, 2, 9);
  setAgentPosition(agents, 3, 19, 18);

  return agents;
}

describe("Agent SoA", () => {
  it("stores agent positions in columnar arrays", () => {
    const agents = createProbeAgents();

    expect(agents.count).toBe(4);
    expect(Array.from(agents.positions.slice(0, 8))).toEqual([
      1, 1, 11, 1, 2, 9, 19, 18,
    ]);
  });
});

describe("spatial hash grid", () => {
  it("builds deterministic CPU grid counts, offsets and sorted ids", () => {
    const agents = createProbeAgents();
    const layout = createSpatialHashGridLayout({
      width: 20,
      height: 20,
      cellSize: 10,
    });
    const grid = buildSpatialHashGridCpu(agents, layout);

    expect(Array.from(grid.cellIds)).toEqual([0, 1, 0, 3]);
    expect(Array.from(grid.cellCounts)).toEqual([2, 1, 0, 1]);
    expect(Array.from(grid.cellOffsets)).toEqual([0, 2, 3, 3, 4]);
    expect(Array.from(grid.sortedAgentIds)).toEqual([0, 2, 1, 3]);
  });

  const maybeNavigator = globalThis.navigator as
    | (Navigator & { gpu?: GPU })
    | undefined;
  const gpuTest = maybeNavigator?.gpu ? it : it.skip;

  gpuTest("matches CPU readback when WebGPU is available", async () => {
    const adapter = await maybeNavigator?.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();

    expect(device).toBeDefined();

    const agents = createProbeAgents();
    const layout = createSpatialHashGridLayout({
      width: 20,
      height: 20,
      cellSize: 10,
    });
    const expected = buildSpatialHashGridCpu(agents, layout);
    const actual = await buildSpatialHashGridGpu(device!, agents, layout);

    expect(Array.from(actual.cellIds)).toEqual(Array.from(expected.cellIds));
    expect(Array.from(actual.cellCounts)).toEqual(Array.from(expected.cellCounts));
    expect(Array.from(actual.cellOffsets)).toEqual(Array.from(expected.cellOffsets));
    expect(Array.from(actual.sortedAgentIds)).toEqual(
      Array.from(expected.sortedAgentIds),
    );

    device!.destroy();
  });
});

describe("density grid", () => {
  it("accumulates deterministic CPU density counts", () => {
    const agents = createProbeAgents();
    const layout = createSpatialHashGridLayout({
      width: 20,
      height: 20,
      cellSize: 10,
    });
    const density = accumulateDensityCpu(agents, layout);

    expect(Array.from(density.cellCounts)).toEqual([2, 1, 0, 1]);
    expect(density.maxCount).toBe(2);
  });

  const maybeNavigator = globalThis.navigator as
    | (Navigator & { gpu?: GPU })
    | undefined;
  const gpuTest = maybeNavigator?.gpu ? it : it.skip;

  gpuTest("matches CPU density readback when WebGPU is available", async () => {
    const adapter = await maybeNavigator?.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();

    expect(device).toBeDefined();

    const agents = createProbeAgents();
    const layout = createSpatialHashGridLayout({
      width: 20,
      height: 20,
      cellSize: 10,
    });
    const expected = accumulateDensityCpu(agents, layout);
    const actual = await accumulateDensityGpu(device!, agents, layout);

    expect(Array.from(actual.cellCounts)).toEqual(Array.from(expected.cellCounts));
    expect(actual.maxCount).toBe(expected.maxCount);

    device!.destroy();
  });
});

function createSocialForceProbe() {
  const agents = createAgentSoA(3);

  setAgentPosition(agents, 0, 0, 0);
  setAgentPosition(agents, 1, 0.5, 0);
  setAgentPosition(agents, 2, 2, 0.2);
  setAgentVelocity(agents, 0, 0, 0);
  setAgentVelocity(agents, 1, 0, 0);
  setAgentVelocity(agents, 2, 0, 0);

  return agents;
}

const socialForceTargets = new Float32Array([6, 0, 6, 0, 6, 0]);
const socialForceWalls: WallSegment[] = [{ x1: 1.2, y1: -1, x2: 1.2, y2: 1 }];
const socialForceParams: SocialForceParams = {
  dt: 0.1,
  desiredSpeed: 1.4,
  relaxationTime: 0.5,
  agentRepulsionStrength: 2.2,
  agentRepulsionRange: 1,
  wallRepulsionStrength: 1.8,
  wallRepulsionRange: 0.8,
  maxSpeed: 2,
};

describe("social force step", () => {
  it("moves agents toward targets while applying repulsion", () => {
    const agents = createSocialForceProbe();
    const result = stepSocialForceCpu(
      agents,
      socialForceTargets,
      socialForceWalls,
      socialForceParams,
    );

    expect(result.positions[0]).toBeGreaterThan(0);
    expect(result.positions[4]).toBeGreaterThan(2);
    expect(result.velocities[0]).toBeLessThan(result.velocities[4]);
  });

  const maybeNavigator = globalThis.navigator as
    | (Navigator & { gpu?: GPU })
    | undefined;
  const gpuTest = maybeNavigator?.gpu ? it : it.skip;

  gpuTest("matches CPU readback when WebGPU is available", async () => {
    const adapter = await maybeNavigator?.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();

    expect(device).toBeDefined();

    const agents = createSocialForceProbe();
    const expected = stepSocialForceCpu(
      agents,
      socialForceTargets,
      socialForceWalls,
      socialForceParams,
    );
    const actual = await stepSocialForceGpu(
      device!,
      agents,
      socialForceTargets,
      socialForceWalls,
      socialForceParams,
    );

    expect(Array.from(actual.positions)).toEqual(
      Array.from(expected.positions).map((value) => expect.closeTo(value, 5)),
    );
    expect(Array.from(actual.velocities)).toEqual(
      Array.from(expected.velocities).map((value) => expect.closeTo(value, 5)),
    );

    device!.destroy();
  });
});

describe("flow field", () => {
  it("generates directions toward the target cell with BFS distances", () => {
    const layout = createSpatialHashGridLayout({
      width: 5,
      height: 1,
      cellSize: 1,
    });
    const flowField = createFlowFieldCpu({
      layout,
      targetCell: 4,
    });

    expect(Array.from(flowField.distances)).toEqual([4, 3, 2, 1, 0]);
    expect(Array.from(flowField.directions)).toEqual([1, 0, 1, 0, 1, 0, 1, 0, 0, 0]);
  });

  it("rasterizes wall segments into blocked cells", () => {
    const layout = createSpatialHashGridLayout({
      width: 5,
      height: 1,
      cellSize: 1,
    });
    const blocked = rasterizeWallsToBlockedCells(layout, [
      { x1: 2.1, y1: 0, x2: 2.9, y2: 0 },
    ]);

    expect(Array.from(blocked)).toEqual([0, 0, 1, 0, 0]);
  });

  const maybeNavigator = globalThis.navigator as
    | (Navigator & { gpu?: GPU })
    | undefined;
  const gpuTest = maybeNavigator?.gpu ? it : it.skip;

  gpuTest("samples flow field texture directions on the GPU", async () => {
    const adapter = await maybeNavigator?.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();

    expect(device).toBeDefined();

    const layout = createSpatialHashGridLayout({
      width: 5,
      height: 1,
      cellSize: 1,
    });
    const flowField = createFlowFieldCpu({
      layout,
      targetCell: 4,
    });
    const agents = createAgentSoA(3);

    setAgentPosition(agents, 0, 0.5, 0.5);
    setAgentPosition(agents, 1, 2.5, 0.5);
    setAgentPosition(agents, 2, 4.5, 0.5);

    const directions = await sampleFlowFieldGpu(device!, agents, flowField);

    expect(Array.from(directions)).toEqual([1, 0, 1, 0, 0, 0]);

    device!.destroy();
  });
});
