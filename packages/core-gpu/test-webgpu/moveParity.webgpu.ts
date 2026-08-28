import { describe, expect, it } from "vitest";
import {
  createAgentSoA,
  createSpatialHashGridLayout,
  setAgentPosition,
  setAgentSpeed,
  stepSocialForceCpu,
  type SocialForceParams,
  type WallSegment,
} from "../src/index";
import { stepForParity } from "../src/gpuSimCore";

// Self-skips without a real WebGPU adapter (see test-webgpu/README.md).
const maybeNavigator = globalThis.navigator as (Navigator & { gpu?: GPU }) | undefined;
const gpuTest = maybeNavigator?.gpu ? it : it.skip;

describe("fused move parity (real WebGPU)", () => {
  gpuTest(
    "fused GPU move matches stepSocialForceCpu within 1e-3 over 20 steps",
    async () => {
      const adapter = await maybeNavigator?.gpu?.requestAdapter();
      const device = await adapter?.requestDevice();
      expect(device).toBeDefined();

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
      const walls: WallSegment[] = [{ x1: 0, y1: 0, x2: 64, y2: 0 }];
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
      // cellSize >= agentRepulsionRange so the GPU 3x3 neighborhood is exact.
      const layout = createSpatialHashGridLayout({
        width: 64,
        height: 64,
        cellSize: 2,
      });

      // CPU reference: 20 steps, rebuilding SoA from each step's result.
      let cpuAgents = agents;
      for (let s = 0; s < 20; s++) {
        const result = stepSocialForceCpu(cpuAgents, targets, walls, params);
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
