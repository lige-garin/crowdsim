import { describe, expect, it } from "vitest";
import {
  createGpuSimCore,
  createSpatialHashGridLayout,
  type AgentSpawn,
  type GpuSimCore,
  type GpuSimCoreSocialForceParams,
} from "../src/index";
import { enqueueCopyToReadbackBuffer, readFloat32Array } from "../src/gpuUtils";

// Self-skips without a real WebGPU adapter (see test-webgpu/README.md).
const maybeNavigator = globalThis.navigator as (Navigator & { gpu?: GPU }) | undefined;
const gpuTest = maybeNavigator?.gpu ? it : it.skip;

const N = 256;
const layout = createSpatialHashGridLayout({ width: 128, height: 128, cellSize: 4 });
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
  anticipationRangeMeters: 3,
  anticipationMaxAcceleration: 5,
};
const spawns: AgentSpawn[] = Array.from({ length: N }, (_, i) => ({
  index: i,
  x: 4 + (i % 16) * 2,
  y: 4 + Math.floor(i / 16) * 2,
  speed: 1.34,
  radius: 0.22,
  targetX: 100,
  targetY: 100,
}));

function makeCore(device: GPUDevice): GpuSimCore {
  const core = createGpuSimCore(device, { capacity: N, layout, walls: [], params });
  core.setCount(N);
  core.uploadSpawns(spawns);
  return core;
}

async function readPositions(device: GPUDevice, buffer: GPUBuffer) {
  const encoder = device.createCommandEncoder();
  const readback = enqueueCopyToReadbackBuffer(device, encoder, buffer, N * 2);
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  const positions = await readFloat32Array(readback, N * 2);
  readback.destroy();
  return positions;
}

describe("GPU core determinism + zero-readback (real WebGPU)", () => {
  gpuTest("step() performs no buffer mapping; only readAggregates maps", async () => {
    const adapter = await maybeNavigator?.gpu?.requestAdapter();
    const device = await adapter?.requestDevice({
      requiredLimits: { maxStorageBuffersPerShaderStage: 13 },
    });
    expect(device).toBeDefined();

    const core = makeCore(device!);
    const originalMapAsync = GPUBuffer.prototype.mapAsync;
    let mapCount = 0;
    GPUBuffer.prototype.mapAsync = function patched(
      this: GPUBuffer,
      ...args: Parameters<GPUBuffer["mapAsync"]>
    ) {
      mapCount++;
      return originalMapAsync.apply(this, args);
    };

    try {
      for (let i = 0; i < 50; i++) {
        core.step(1 / 60);
      }
      await device!.queue.onSubmittedWorkDone();
      expect(mapCount).toBe(0); // 50 steps, zero per-frame readback

      await core.readAggregates();
      expect(mapCount).toBeGreaterThan(0); // readAggregates is the only mapping path
    } finally {
      GPUBuffer.prototype.mapAsync = originalMapAsync;
    }

    core.destroy();
    device!.destroy();
  });

  gpuTest("identical cores produce identical results after 40 steps", async () => {
    const adapter = await maybeNavigator?.gpu?.requestAdapter();
    const device = await adapter?.requestDevice({
      requiredLimits: { maxStorageBuffersPerShaderStage: 13 },
    });
    expect(device).toBeDefined();

    const coreA = makeCore(device!);
    const coreB = makeCore(device!);
    for (let i = 0; i < 40; i++) {
      coreA.step(1 / 60);
      coreB.step(1 / 60);
    }

    const aggregatesA = await coreA.readAggregates();
    const aggregatesB = await coreB.readAggregates();
    // counts are integers -> exact on the same device.
    expect(Array.from(aggregatesA.cellCounts)).toEqual(
      Array.from(aggregatesB.cellCounts),
    );

    const positionsA = await readPositions(device!, coreA.positionsBuffer());
    const positionsB = await readPositions(device!, coreB.positionsBuffer());
    for (let i = 0; i < N * 2; i++) {
      expect(Math.abs(positionsA[i] - positionsB[i])).toBeLessThan(1e-3);
    }

    coreA.destroy();
    coreB.destroy();
    device!.destroy();
  });
});
