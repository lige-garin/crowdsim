import { describe, expect, it } from "vitest";
import {
  createGpuSimCore,
  createSpatialHashGridLayout,
  type AgentSpawn,
  type SocialForceParams,
} from "../src/index";
import { enqueueCopyToReadbackBuffer, readFloat32Array } from "../src/gpuUtils";

// Self-skips without a real WebGPU adapter (see test-webgpu/README.md).
const maybeNavigator = globalThis.navigator as (Navigator & { gpu?: GPU }) | undefined;
const gpuTest = maybeNavigator?.gpu ? it : it.skip;

async function readPositions(device: GPUDevice, buffer: GPUBuffer, count: number) {
  const encoder = device.createCommandEncoder();
  const readback = enqueueCopyToReadbackBuffer(device, encoder, buffer, count * 2);
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  const positions = await readFloat32Array(readback, count * 2);
  readback.destroy();
  return positions;
}

function centreOfMass(positions: Float32Array, count: number) {
  let x = 0;
  let y = 0;
  for (let i = 0; i < count; i++) {
    x += positions[i * 2];
    y += positions[i * 2 + 1];
  }
  return { x: x / count, y: y / count };
}

describe("createGpuSimCore (real WebGPU)", () => {
  gpuTest(
    "spawns, steps with no readback, and aggregates density == count",
    async () => {
      const adapter = await maybeNavigator?.gpu?.requestAdapter();
      const device = await adapter?.requestDevice({
        requiredLimits: { maxStorageBuffersPerShaderStage: 10 },
      });
      expect(device).toBeDefined();

      const N = 512;
      const layout = createSpatialHashGridLayout({
        width: 128,
        height: 128,
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
      const target = { x: 110, y: 110 };

      const core = createGpuSimCore(device!, {
        capacity: N,
        layout,
        walls: [],
        params,
      });
      const spawns: AgentSpawn[] = Array.from({ length: N }, (_, i) => ({
        index: i,
        x: 4 + (i % 32) * 2,
        y: 4 + Math.floor(i / 32) * 2,
        speed: 1.3,
        targetX: target.x,
        targetY: target.y,
      }));
      core.setCount(N);
      core.uploadSpawns(spawns);

      const initialCom = centreOfMass(
        await readPositions(device!, core.positionsBuffer(), N),
        N,
      );
      for (let i = 0; i < 30; i++) {
        core.step(1 / 60);
      }
      const finalCom = centreOfMass(
        await readPositions(device!, core.positionsBuffer(), N),
        N,
      );

      const aggregates = await core.readAggregates();
      const totalDensity = aggregates.cellCounts.reduce((sum, value) => sum + value, 0);
      expect(totalDensity).toBe(N);
      expect(aggregates.maxCount).toBeGreaterThanOrEqual(1);

      const distInitial = Math.hypot(initialCom.x - target.x, initialCom.y - target.y);
      const distFinal = Math.hypot(finalCom.x - target.x, finalCom.y - target.y);
      expect(distFinal).toBeLessThan(distInitial);

      core.destroy();
      device!.destroy();
    },
  );
});
