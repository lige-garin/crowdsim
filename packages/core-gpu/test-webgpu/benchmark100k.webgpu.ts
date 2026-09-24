import { describe, expect, it } from "vitest";
import {
  createGpuSimCore,
  createSpatialHashGridLayout,
  type AgentSpawn,
  type GpuSimCoreSocialForceParams,
} from "../src/index";

// Self-skips without a real WebGPU adapter (see test-webgpu/README.md). On real
// hardware this records the 100k step-time -> packages/core-gpu/BENCHMARKS.md.
const maybeNavigator = globalThis.navigator as (Navigator & { gpu?: GPU }) | undefined;
const gpuTest = maybeNavigator?.gpu ? it : it.skip;

describe("100k step-time benchmark (real WebGPU)", () => {
  gpuTest("100k agents step-time", async () => {
    const adapter = await maybeNavigator?.gpu?.requestAdapter();
    const device = await adapter?.requestDevice({
      requiredLimits: { maxStorageBuffersPerShaderStage: 14 },
    });
    expect(device).toBeDefined();

    const N = 100_000;
    // cellSize (4) >= interactionRangeMeters (2) so the 3x3 neighborhood is exact.
    const layout = createSpatialHashGridLayout({
      width: 1000,
      height: 1000,
      cellSize: 4,
    });
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
    const core = createGpuSimCore(device!, {
      capacity: N,
      layout,
      walls: [],
      params,
    });
    const spawns: AgentSpawn[] = Array.from({ length: N }, (_, i) => ({
      index: i,
      x: (i % 250) * 4,
      y: Math.floor(i / 250) * 4,
      speed: 1.34,
      radius: 0.22,
      targetX: 500,
      targetY: 500,
    }));
    core.setCount(N);
    core.uploadSpawns(spawns);

    for (let i = 0; i < 10; i++) {
      core.step(1 / 60);
    }
    await device!.queue.onSubmittedWorkDone();

    const startedAt = performance.now();
    for (let i = 0; i < 100; i++) {
      core.step(1 / 60);
    }
    await device!.queue.onSubmittedWorkDone();
    const msPerStep = (performance.now() - startedAt) / 100;

    // Informational-but-checked: record the number in BENCHMARKS.md and decide the
    // 60fps (<16.6) verdict there. Do NOT assert <16.6 here.
    console.log(`100k ms/step = ${msPerStep.toFixed(3)}`);
    expect(msPerStep).toBeGreaterThan(0);

    core.destroy();
    device!.destroy();
  });
});
