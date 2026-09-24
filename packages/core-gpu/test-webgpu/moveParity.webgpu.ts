import { describe, expect, it } from "vitest";
import {
  createAgentSoA,
  createSpatialHashGridLayout,
  setAgentPosition,
  setAgentRadius,
  setAgentSpeed,
  stepGpuSimCoreSocialForceCpu,
  type GpuSimCoreSocialForceParams,
  type WallSegment,
} from "../src/index";
import { stepForParity } from "../src/gpuSimCore";

// Self-skips without a real WebGPU adapter (see test-webgpu/README.md).
const maybeNavigator = globalThis.navigator as (Navigator & { gpu?: GPU }) | undefined;
const gpuTest = maybeNavigator?.gpu ? it : it.skip;

describe("fused move parity (real WebGPU)", () => {
  gpuTest(
    "fused GPU move (ADR-0015 stage 1: exponential falloff + anisotropy + contact) matches stepGpuSimCoreSocialForceCpu within 1e-3 over 20 steps",
    async () => {
      const adapter = await maybeNavigator?.gpu?.requestAdapter();
      const device = await adapter?.requestDevice({
        requiredLimits: { maxStorageBuffersPerShaderStage: 11 },
      });
      expect(device).toBeDefined();

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
      const walls: WallSegment[] = [{ x1: 0, y1: 0, x2: 64, y2: 0 }];
      // Values on the order of crowdMovement.ts's own fitted socialForceParameters
      // (docs/calibration) — this parity test is about the shader matching its
      // own CPU oracle bit-for-bit-ish, not about re-verifying the fit itself.
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
      // cellSize >= interactionRangeMeters so the GPU 3x3 neighborhood is exact.
      const layout = createSpatialHashGridLayout({
        width: 64,
        height: 64,
        cellSize: 2,
      });

      // CPU reference: 20 steps, rebuilding SoA from each step's result.
      let cpuAgents = agents;
      for (let s = 0; s < 20; s++) {
        const result = stepGpuSimCoreSocialForceCpu(cpuAgents, targets, walls, params);
        cpuAgents = {
          ...cpuAgents,
          positions: result.positions,
          velocities: result.velocities,
        };
      }

      const gpu = await stepForParity(
        device!,
        agents,
        targets,
        walls,
        params,
        layout,
        20,
      );

      for (let i = 0; i < N * 2; i++) {
        expect(Math.abs(gpu.positions[i] - cpuAgents.positions[i])).toBeLessThan(1e-3);
      }

      device!.destroy();
    },
  );
});
