import { describe, expect, it } from "vitest";
import {
  createGpuSimCore,
  createSpatialHashGridLayout,
  type AgentSpawn,
  type GpuSimCoreSocialForceParams,
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
        requiredLimits: { maxStorageBuffersPerShaderStage: 16 },
      });
      expect(device).toBeDefined();

      const N = 512;
      const layout = createSpatialHashGridLayout({
        width: 128,
        height: 128,
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
        holdEaseMeters: 1,
        maxSpeedRatio: 1.3,
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
        speed: 1.34,
        radius: 0.22,
        targetX: target.x,
        targetY: target.y,
      }));
      core.setCount(N);
      core.uploadSpawns(spawns);
      // ADR-0033: routedHeading has no in-kernel fallback (unlike every
      // other upload) — zero-initialized at construction means zero desired
      // velocity, so without this call the crowd never walks toward
      // `target` at all (caught on real hardware: identical initial/final
      // centre of mass). A straight line is correct here since this fixture
      // has no walls to route around.
      const routedHeading = new Float32Array(N * 2);
      for (let i = 0; i < N; i++) {
        const dx = target.x - spawns[i].x;
        const dy = target.y - spawns[i].y;
        const length = Math.hypot(dx, dy);
        routedHeading[i * 2] = dx / length;
        routedHeading[i * 2 + 1] = dy / length;
      }
      core.uploadRoutedHeading(routedHeading);

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

  // ADR-0033: a continuing agent's target changes every decision tick (a
  // decision can retarget someone) and its free speed changes tick to tick
  // (fire/smoke exposure, boarding/leaving a connector) — `uploadSpawns`
  // cannot be reused mid-life to push either update, since it also resets
  // position and velocity to the spawn values, which would discard a live
  // agent's GPU-resident velocity every tick. This proves the two new write
  // paths (`uploadTargets`/`uploadSpeeds`) actually reach the kernel and
  // leave position/velocity alone until the next `step()`, not merely that
  // they don't throw.
  gpuTest(
    "uploadTargets and uploadSpeeds update a continuing agent without resetting its GPU-resident velocity",
    async () => {
      const adapter = await maybeNavigator?.gpu?.requestAdapter();
      const device = await adapter?.requestDevice({
        requiredLimits: { maxStorageBuffersPerShaderStage: 16 },
      });
      expect(device).toBeDefined();

      const layout = createSpatialHashGridLayout({
        width: 64,
        height: 64,
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
        holdEaseMeters: 1,
        maxSpeedRatio: 1.3,
      };

      const core = createGpuSimCore(device!, {
        capacity: 1,
        layout,
        walls: [],
        params,
      });
      core.setCount(1);
      core.uploadSpawns([
        {
          index: 0,
          x: 0,
          y: 0,
          speed: 0.2, // slow, so uploadSpeeds's later increase is unmistakable
          radius: 0.22,
          targetX: 1000, // far: the overshoot clamp must stay quiet until retargeted
          targetY: 0,
        },
      ]);
      core.uploadRoutedHeading(new Float32Array([1, 0])); // walking +x throughout

      // Run to a converged steady-state velocity at the slow initial speed
      // (2s, well past 3x relaxationTime) before touching either buffer.
      for (let i = 0; i < 120; i++) core.step(params.dt);
      const beforeRetarget = await core.readback();
      expect(beforeRetarget.velocities[0]).toBeGreaterThan(0.15); // ~0.2 m/s steady state
      expect(beforeRetarget.velocities[0]).toBeLessThan(0.25);

      // uploadTargets alone, no step yet: position/velocity must be
      // completely untouched — it writes a different buffer.
      // 0.0005m ahead: smaller than one step's stride at ANY speed this
      // fixture reaches (~0.2 m/s now, up to ~2 m/s later — even the
      // fastest stride, speed*dt, stays well above this), so the overshoot
      // clamp is guaranteed to engage regardless of current velocity,
      // unlike an earlier version of this test that picked 0.01m and
      // happened to be smaller than the ~0.2 m/s stride, so the clamp
      // never actually fired and the assertion passed for the wrong reason
      // — caught by real-hardware verification, not by reasoning alone.
      const newTargetX = beforeRetarget.positions[0] + 0.0005;
      core.uploadTargets(new Float32Array([newTargetX, 0]));
      const immediatelyAfterUpload = await core.readback();
      expect(immediatelyAfterUpload.positions[0]).toBe(beforeRetarget.positions[0]);
      expect(immediatelyAfterUpload.velocities[0]).toBe(beforeRetarget.velocities[0]);

      // One step later, the new (near) target's overshoot clamp must have
      // engaged: landing almost exactly on it (the clamp scales the step to
      // exactly the remaining distance), not sailing past it as it would
      // have against the old, far target.
      core.step(params.dt);
      const afterRetarget = await core.readback();
      const distanceToNewTarget = Math.abs(afterRetarget.positions[0] - newTargetX);
      expect(distanceToNewTarget).toBeLessThan(0.0002);
      // The clamp scaling a near-stationary step down means velocity must
      // have dropped sharply from the ~0.2 m/s steady state above.
      expect(Math.abs(afterRetarget.velocities[0])).toBeLessThan(0.05);

      // uploadSpeeds: retarget far again so the overshoot clamp is out of
      // the way, run to a new steady state at the OLD (slow) speed, then
      // raise the per-agent speed and confirm the new steady state is much
      // faster — proving the speed buffer write reaches the kernel's
      // freeSpeed derivation, not just that the call doesn't throw.
      core.uploadTargets(new Float32Array([1000, 0]));
      for (let i = 0; i < 120; i++) core.step(params.dt);
      const beforeRespeed = await core.readback();
      expect(beforeRespeed.velocities[0]).toBeGreaterThan(0.15);
      expect(beforeRespeed.velocities[0]).toBeLessThan(0.25);

      core.uploadSpeeds(new Float32Array([2.0]));
      for (let i = 0; i < 120; i++) core.step(params.dt);
      const afterRespeed = await core.readback();
      expect(afterRespeed.velocities[0]).toBeGreaterThan(1.5);

      core.destroy();
      device!.destroy();
    },
  );
});
