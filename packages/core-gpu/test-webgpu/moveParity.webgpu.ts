import { describe, expect, it } from "vitest";
import {
  createAgentSoA,
  createSpatialHashGridLayout,
  setAgentPosition,
  setAgentRadius,
  setAgentSpeed,
  setAgentVelocity,
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
        requiredLimits: { maxStorageBuffersPerShaderStage: 13 },
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
        sidestep: 0.6,
        sidestepCone: 0.7,
        anticipationStrength: 1.5,
        anticipationHorizonSeconds: 3,
        anticipationRangeMeters: 2,
        anticipationMaxAcceleration: 5,
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

  gpuTest(
    "fused GPU move (ADR-0015 stage 2: in-formation spring force) matches stepGpuSimCoreSocialForceCpu within 1e-3 over 20 steps",
    async () => {
      const adapter = await maybeNavigator?.gpu?.requestAdapter();
      const device = await adapter?.requestDevice({
        requiredLimits: { maxStorageBuffersPerShaderStage: 13 },
      });
      expect(device).toBeDefined();

      const N = 40;
      const agents = createAgentSoA(N);
      const groupIds = new Int32Array(N);
      const formationSlots = new Float32Array(N * 2);
      const targets = new Float32Array(N * 2);
      for (let i = 0; i < N; i++) {
        setAgentPosition(agents, i, 5 + (i % 8) * 1.5, 5 + Math.floor(i / 8) * 1.5);
        setAgentSpeed(agents, i, 1.34);
        setAgentRadius(agents, i, 0.22);
        // Pairs of two, each slotted 0.4m to the side of its own start point
        // — the formation force has real, non-zero work to do every step.
        groupIds[i] = Math.floor(i / 2);
        formationSlots[i * 2] = 5 + (i % 8) * 1.5 + 0.4;
        formationSlots[i * 2 + 1] = 5 + Math.floor(i / 8) * 1.5;
        targets[i * 2] = 60;
        targets[i * 2 + 1] = 60;
      }
      const walls: WallSegment[] = [{ x1: 0, y1: 0, x2: 64, y2: 0 }];
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
        anticipationRangeMeters: 2,
        anticipationMaxAcceleration: 5,
      };
      const layout = createSpatialHashGridLayout({
        width: 64,
        height: 64,
        cellSize: 2,
      });

      let cpuAgents = agents;
      for (let s = 0; s < 20; s++) {
        const result = stepGpuSimCoreSocialForceCpu(
          cpuAgents,
          targets,
          walls,
          params,
          groupIds,
          formationSlots,
        );
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
        groupIds,
        formationSlots,
      );

      for (let i = 0; i < N * 2; i++) {
        expect(Math.abs(gpu.positions[i] - cpuAgents.positions[i])).toBeLessThan(1e-3);
      }

      device!.destroy();
    },
  );

  gpuTest(
    "fused GPU move (ADR-0015 stage 3: sidestep + group-gated repulsion) matches stepGpuSimCoreSocialForceCpu within 1e-3 over 20 steps",
    async () => {
      const adapter = await maybeNavigator?.gpu?.requestAdapter();
      const device = await adapter?.requestDevice({
        requiredLimits: { maxStorageBuffersPerShaderStage: 13 },
      });
      expect(device).toBeDefined();

      const N = 40;
      const agents = createAgentSoA(N);
      const groupIds = new Int32Array(N);
      const formationSlots = new Float32Array(N * 2);
      const targets = new Float32Array(N * 2);
      for (let i = 0; i < N; i++) {
        // Tighter spacing than the stage 1/2 fixtures (0.8m vs 1.2-2m) so
        // agents actually interact and trigger sidestep — the stage 2
        // fixture's 1.2-1.5m spacing barely exercised repulsion at all.
        setAgentPosition(agents, i, 5 + (i % 8) * 0.8, 5 + Math.floor(i / 8) * 0.8);
        setAgentSpeed(agents, i, 1.34);
        setAgentRadius(agents, i, 0.22);
        // Adjacent pairs (0,1), (2,3), ... are 0.8m apart, well within
        // interactionRangeMeters — every third such pair shares a group, so
        // some near pairs are "together" (repulsion zeroed, sidestep
        // zeroed) and most are strangers (both active): a mix, not an
        // all-or-nothing fixture. The earlier version of this fixture
        // (i % 3 === 0 grouped by floor(i / 6)) put group-mates 2.4m
        // apart — further than interactionRangeMeters — so it never
        // actually exercised the together gate at all; caught by this
        // test's own sanity check (togetherPairsFoundClose) logged in the
        // temporary verification harness, not by this assertion itself.
        groupIds[i] = Math.floor(i / 2) % 3 === 0 ? Math.floor(i / 2) : -1;
        formationSlots[i * 2] = 5 + (i % 8) * 0.8 + 0.3;
        formationSlots[i * 2 + 1] = 5 + Math.floor(i / 8) * 0.8;
        targets[i * 2] = 60;
        targets[i * 2 + 1] = 60;
      }
      const walls: WallSegment[] = [{ x1: 0, y1: 0, x2: 64, y2: 0 }];
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
        anticipationRangeMeters: 2,
        anticipationMaxAcceleration: 5,
      };
      const layout = createSpatialHashGridLayout({
        width: 64,
        height: 64,
        cellSize: 2,
      });

      let cpuAgents = agents;
      for (let s = 0; s < 20; s++) {
        const result = stepGpuSimCoreSocialForceCpu(
          cpuAgents,
          targets,
          walls,
          params,
          groupIds,
          formationSlots,
        );
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
        groupIds,
        formationSlots,
      );

      for (let i = 0; i < N * 2; i++) {
        expect(Math.abs(gpu.positions[i] - cpuAgents.positions[i])).toBeLessThan(1e-3);
      }

      device!.destroy();
    },
  );

  gpuTest(
    "fused GPU move (ADR-0015 stage 4: anticipation) matches stepGpuSimCoreSocialForceCpu within 1e-3 over 20 steps",
    async () => {
      const adapter = await maybeNavigator?.gpu?.requestAdapter();
      const device = await adapter?.requestDevice({
        requiredLimits: { maxStorageBuffersPerShaderStage: 13 },
      });
      expect(device).toBeDefined();

      // crowdMovement.ts's own default anticipationRangeMeters (3m) needs a
      // cellSize that covers it, unlike the earlier fixtures in this file
      // (which deliberately matched anticipation's range down to their own
      // 2m cellSize) — this fixture exists specifically to exercise the
      // wider range for real.
      const N = 30;
      const agents = createAgentSoA(N);
      const targets = new Float32Array(N * 2);
      for (let i = 0; i < N; i++) {
        setAgentPosition(agents, i, 5 + (i % 6) * 1.5, 5 + Math.floor(i / 6) * 1.5);
        // Alternate facing directions head-on so plenty of pairs are
        // actually on a collision course, not just closely spaced.
        setAgentVelocity(agents, i, i % 2 === 0 ? 1.2 : -1.2, 0);
        setAgentRadius(agents, i, 0.22);
        targets[i * 2] = i % 2 === 0 ? 60 : -60;
        targets[i * 2 + 1] = 5 + Math.floor(i / 6) * 1.5;
      }
      const walls: WallSegment[] = [{ x1: 0, y1: 0, x2: 64, y2: 0 }];
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
      const layout = createSpatialHashGridLayout({
        width: 64,
        height: 64,
        cellSize: 3,
      });

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
