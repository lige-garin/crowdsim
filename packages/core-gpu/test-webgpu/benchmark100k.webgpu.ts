import { describe, expect, it } from "vitest";
import {
  createGpuSimCore,
  createSpatialHashGridLayout,
  type AgentSpawn,
  type SocialForceParams,
} from "../src/index";

// Self-skips without a real WebGPU adapter (see test-webgpu/README.md). On real
// hardware this records the 100k step-time -> packages/core-gpu/BENCHMARKS.md.
const maybeNavigator = globalThis.navigator as (Navigator & { gpu?: GPU }) | undefined;
const gpuTest = maybeNavigator?.gpu ? it : it.skip;

describe("100k step-time benchmark (real WebGPU)", () => {
  gpuTest("100k agents step-time", async () => {
    const adapter = await maybeNavigator?.gpu?.requestAdapter();
    const device = await adapter?.requestDevice({
      requiredLimits: { maxStorageBuffersPerShaderStage: 10 },
    });
    expect(device).toBeDefined();

    const N = 100_000;
    // cellSize (4) >= agentRepulsionRange (1.5) so the 3x3 neighborhood is exact.
    const layout = createSpatialHashGridLayout({
      width: 1000,
      height: 1000,
      cellSize: 4,
    });
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
      speed: 1.3,
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
