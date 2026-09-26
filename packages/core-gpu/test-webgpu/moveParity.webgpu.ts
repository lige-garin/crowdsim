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
        requiredLimits: { maxStorageBuffersPerShaderStage: 16 },
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
        holdEaseMeters: 1,
        maxSpeedRatio: 1.3,
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
        requiredLimits: { maxStorageBuffersPerShaderStage: 16 },
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
        holdEaseMeters: 1,
        maxSpeedRatio: 1.3,
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
        requiredLimits: { maxStorageBuffersPerShaderStage: 16 },
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
        holdEaseMeters: 1,
        maxSpeedRatio: 1.3,
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
        requiredLimits: { maxStorageBuffersPerShaderStage: 16 },
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
        holdEaseMeters: 1,
        maxSpeedRatio: 1.3,
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

  gpuTest(
    "fused GPU move (ADR-0015 stage 5: hazard avoidance) matches stepGpuSimCoreSocialForceCpu within 1e-3 over 20 steps",
    async () => {
      const adapter = await maybeNavigator?.gpu?.requestAdapter();
      const device = await adapter?.requestDevice({
        requiredLimits: { maxStorageBuffersPerShaderStage: 16 },
      });
      expect(device).toBeDefined();

      // hazardAvoidance is not neighbour-dependent, so a small, ordinary
      // scene suffices — the thing worth exercising is that a distinct
      // per-agent vector actually reaches the shader, not crowd density.
      const N = 20;
      const agents = createAgentSoA(N);
      const targets = new Float32Array(N * 2);
      const hazardAvoidance = new Float32Array(N * 2);
      for (let i = 0; i < N; i++) {
        setAgentPosition(agents, i, 5 + (i % 5) * 2, 5 + Math.floor(i / 5) * 2);
        setAgentSpeed(agents, i, 1.34);
        setAgentRadius(agents, i, 0.22);
        targets[i * 2] = 60;
        targets[i * 2 + 1] = 60;
        // A distinct push per agent (not a uniform vector), so a shader bug
        // that broadcasts one agent's value to everyone would show up as a
        // parity failure rather than being masked by uniformity.
        hazardAvoidance[i * 2] = (i % 4) - 1.5;
        hazardAvoidance[i * 2 + 1] = ((i * 2) % 4) - 1.5;
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
        holdEaseMeters: 1,
        maxSpeedRatio: 1.3,
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
          undefined,
          undefined,
          hazardAvoidance,
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
        undefined,
        undefined,
        hazardAvoidance,
      );

      for (let i = 0; i < N * 2; i++) {
        expect(Math.abs(gpu.positions[i] - cpuAgents.positions[i])).toBeLessThan(1e-3);
      }

      device!.destroy();
    },
  );

  gpuTest(
    "fused GPU move (ADR-0015 stage 6: distance-based speed easing, holding, exact exponential relaxation) matches stepGpuSimCoreSocialForceCpu within 1e-3 over 20 steps",
    async () => {
      const adapter = await maybeNavigator?.gpu?.requestAdapter();
      const device = await adapter?.requestDevice({
        requiredLimits: { maxStorageBuffersPerShaderStage: 16 },
      });
      expect(device).toBeDefined();

      // Targets close enough that desiredSpeed's distance easing actually
      // binds (not just "far away, always at freeSpeed") — the whole point
      // of this stage. Every third agent holds (uses holdEaseMeters instead
      // of relaxationTime for that easing), a mix like stage 3's grouping.
      const N = 20;
      const agents = createAgentSoA(N);
      const targets = new Float32Array(N * 2);
      const holding = new Uint32Array(N);
      for (let i = 0; i < N; i++) {
        setAgentPosition(agents, i, 5 + (i % 5) * 1.2, 5 + Math.floor(i / 5) * 1.2);
        setAgentSpeed(agents, i, 1.34);
        setAgentRadius(agents, i, 0.22);
        targets[i * 2] = 5 + (i % 5) * 1.2 + 0.3;
        targets[i * 2 + 1] = 5 + Math.floor(i / 5) * 1.2;
        holding[i] = i % 3 === 0 ? 1 : 0;
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
        holdEaseMeters: 1,
        maxSpeedRatio: 1.3,
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
          undefined,
          undefined,
          undefined,
          holding,
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
        undefined,
        undefined,
        undefined,
        holding,
      );

      for (let i = 0; i < N * 2; i++) {
        expect(Math.abs(gpu.positions[i] - cpuAgents.positions[i])).toBeLessThan(1e-3);
      }

      device!.destroy();
    },
  );

  gpuTest(
    "fused GPU move (ADR-0015 stage 7: no-walking-backward clamp) matches stepGpuSimCoreSocialForceCpu within 1e-3 over 20 steps",
    async () => {
      const adapter = await maybeNavigator?.gpu?.requestAdapter();
      const device = await adapter?.requestDevice({
        requiredLimits: { maxStorageBuffersPerShaderStage: 16 },
      });
      expect(device).toBeDefined();

      // Opposing pairs packed close (0.15m apart, well inside both
      // interactionRangeMeters and contact range) with targets on opposite
      // ends of a corridor — strong forward-pushing repulsion from directly
      // ahead is exactly the scenario that drives a non-holding agent's
      // velocity backward along its own heading without this stage's clamp.
      // Every third agent holds (stage 6's own mixing pattern), which must
      // NOT get the clamp.
      const N = 12;
      const agents = createAgentSoA(N);
      const targets = new Float32Array(N * 2);
      const holding = new Uint32Array(N);
      for (let pair = 0; pair < N / 2; pair++) {
        const y = 5 + pair * 1.5;
        const a = pair * 2;
        const b = pair * 2 + 1;
        setAgentPosition(agents, a, 10, y);
        setAgentPosition(agents, b, 10.15, y);
        setAgentSpeed(agents, a, 1.34);
        setAgentSpeed(agents, b, 1.34);
        setAgentRadius(agents, a, 0.22);
        setAgentRadius(agents, b, 0.22);
        targets[a * 2] = 60;
        targets[a * 2 + 1] = y;
        targets[b * 2] = -40;
        targets[b * 2 + 1] = y;
        holding[a] = a % 3 === 0 ? 1 : 0;
        holding[b] = b % 3 === 0 ? 1 : 0;
      }
      const walls: WallSegment[] = [];
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
        holdEaseMeters: 1,
        maxSpeedRatio: 1.3,
      };
      const layout = createSpatialHashGridLayout({
        width: 96,
        height: 32,
        cellSize: 2,
      });

      let cpuAgents = agents;
      for (let s = 0; s < 20; s++) {
        const result = stepGpuSimCoreSocialForceCpu(
          cpuAgents,
          targets,
          walls,
          params,
          undefined,
          undefined,
          undefined,
          holding,
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
        undefined,
        undefined,
        undefined,
        holding,
      );

      for (let i = 0; i < N * 2; i++) {
        expect(Math.abs(gpu.positions[i] - cpuAgents.positions[i])).toBeLessThan(1e-3);
      }

      device!.destroy();
    },
  );

  gpuTest(
    "fused GPU move (ADR-0015 stage 8: no-overshoot-past-target clamp) matches stepGpuSimCoreSocialForceCpu within 1e-3 over 20 steps",
    async () => {
      const adapter = await maybeNavigator?.gpu?.requestAdapter();
      const device = await adapter?.requestDevice({
        requiredLimits: { maxStorageBuffersPerShaderStage: 16 },
      });
      expect(device).toBeDefined();

      // A large initial velocity aimed straight at a nearby target, spread
      // out so agents don't interact with each other (this stage's clamp is
      // purely per-agent, not neighbour-dependent) — the maxSpeedRatio-
      // clamped step length (~0.029m at 1/60s) would sail straight past a
      // target only ~0.02m away without this stage's clamp. Every third
      // agent holds (stage 6/7's own mixing pattern), which must NOT get
      // this clamp and so is free to overshoot.
      const N = 12;
      const agents = createAgentSoA(N);
      const targets = new Float32Array(N * 2);
      const holding = new Uint32Array(N);
      for (let i = 0; i < N; i++) {
        const x = 5 + i * 4;
        setAgentPosition(agents, i, x, 5);
        setAgentVelocity(agents, i, 10, 0);
        setAgentRadius(agents, i, 0.22);
        targets[i * 2] = x + 0.02;
        targets[i * 2 + 1] = 5;
        holding[i] = i % 3 === 0 ? 1 : 0;
      }
      const walls: WallSegment[] = [];
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
        holdEaseMeters: 1,
        maxSpeedRatio: 1.3,
      };
      const layout = createSpatialHashGridLayout({
        width: 96,
        height: 32,
        cellSize: 2,
      });

      let cpuAgents = agents;
      for (let s = 0; s < 20; s++) {
        const result = stepGpuSimCoreSocialForceCpu(
          cpuAgents,
          targets,
          walls,
          params,
          undefined,
          undefined,
          undefined,
          holding,
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
        undefined,
        undefined,
        undefined,
        holding,
      );

      for (let i = 0; i < N * 2; i++) {
        expect(Math.abs(gpu.positions[i] - cpuAgents.positions[i])).toBeLessThan(1e-3);
      }

      device!.destroy();
    },
  );

  gpuTest(
    "fused GPU move (ADR-0033: routedHeading decoupled from target-derived direction) matches stepGpuSimCoreSocialForceCpu within 1e-3 over 20 steps",
    async () => {
      const adapter = await maybeNavigator?.gpu?.requestAdapter();
      const device = await adapter?.requestDevice({
        requiredLimits: { maxStorageBuffersPerShaderStage: 16 },
      });
      expect(device).toBeDefined();

      // Targets are straight ahead on +x for every agent, but routedHeading
      // points +y instead — as a router would when a wall blocks line of
      // sight to that +x target. If the kernel still derived direction from
      // `targets` (the pre-ADR-0033 behaviour), this would diverge sharply
      // from the CPU oracle, which is given the identical routedHeading.
      const N = 12;
      const agents = createAgentSoA(N);
      const targets = new Float32Array(N * 2);
      const routedHeading = new Float32Array(N * 2);
      for (let i = 0; i < N; i++) {
        const x = 5 + i * 3;
        setAgentPosition(agents, i, x, 5);
        setAgentSpeed(agents, i, 1.34);
        setAgentRadius(agents, i, 0.22);
        targets[i * 2] = x + 50;
        targets[i * 2 + 1] = 5;
        routedHeading[i * 2] = 0;
        routedHeading[i * 2 + 1] = 1;
      }
      const walls: WallSegment[] = [];
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
        holdEaseMeters: 1,
        maxSpeedRatio: 1.3,
      };
      const layout = createSpatialHashGridLayout({
        width: 96,
        height: 32,
        cellSize: 2,
      });

      let cpuAgents = agents;
      for (let s = 0; s < 20; s++) {
        const result = stepGpuSimCoreSocialForceCpu(
          cpuAgents,
          targets,
          walls,
          params,
          undefined,
          undefined,
          undefined,
          undefined,
          routedHeading,
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
        undefined,
        undefined,
        undefined,
        undefined,
        routedHeading,
      );

      for (let i = 0; i < N * 2; i++) {
        expect(Math.abs(gpu.positions[i] - cpuAgents.positions[i])).toBeLessThan(1e-3);
      }
      // Decisive: every agent must have actually walked +y (routedHeading),
      // not +x (the target direction) — proves the kernel is genuinely
      // reading the new binding, not silently ignoring it and happening to
      // land within tolerance some other way.
      for (let i = 0; i < N; i++) {
        const dy = gpu.positions[i * 2 + 1] - agents.positions[i * 2 + 1];
        expect(dy).toBeGreaterThan(0.05);
      }

      device!.destroy();
    },
  );

  gpuTest(
    "fused GPU move (ADR-0033: anticipation and hazard avoidance gated off for a holding agent) matches stepGpuSimCoreSocialForceCpu within 1e-3 over 20 steps",
    async () => {
      const adapter = await maybeNavigator?.gpu?.requestAdapter();
      const device = await adapter?.requestDevice({
        requiredLimits: { maxStorageBuffersPerShaderStage: 16 },
      });
      expect(device).toBeDefined();

      // Head-on collision pairs (triggers anticipation) each also given a
      // nonzero hazard-avoidance vector, with every third agent held —
      // crowdMovement.ts skips BOTH anticipation and hazard avoidance
      // entirely for a holding agent, a real gap this kernel had since
      // stages 4/5 that went unnoticed until scoping ADR-0033's engine
      // wiring (holding didn't exist as a concept until stage 6, and
      // nobody revisited anticipation/hazard once it did).
      const N = 12;
      const agents = createAgentSoA(N);
      const targets = new Float32Array(N * 2);
      const hazardAvoidance = new Float32Array(N * 2);
      const holding = new Uint32Array(N);
      for (let pair = 0; pair < N / 2; pair++) {
        const y = 5 + pair * 3;
        const a = pair * 2;
        const b = pair * 2 + 1;
        setAgentPosition(agents, a, 10, y);
        setAgentVelocity(agents, a, 1.34, 0);
        setAgentRadius(agents, a, 0.22);
        setAgentPosition(agents, b, 11.5, y);
        setAgentVelocity(agents, b, -1.34, 0);
        setAgentRadius(agents, b, 0.22);
        targets[a * 2] = 40;
        targets[a * 2 + 1] = y;
        targets[b * 2] = -20;
        targets[b * 2 + 1] = y;
        hazardAvoidance[a * 2 + 1] = 0.5;
        hazardAvoidance[b * 2 + 1] = -0.5;
        holding[a] = a % 3 === 0 ? 1 : 0;
        holding[b] = b % 3 === 0 ? 1 : 0;
      }
      const walls: WallSegment[] = [];
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
        holdEaseMeters: 1,
        maxSpeedRatio: 1.3,
      };
      const layout = createSpatialHashGridLayout({
        width: 96,
        height: 32,
        cellSize: 2,
      });

      let cpuAgents = agents;
      for (let s = 0; s < 20; s++) {
        const result = stepGpuSimCoreSocialForceCpu(
          cpuAgents,
          targets,
          walls,
          params,
          undefined,
          undefined,
          hazardAvoidance,
          holding,
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
        undefined,
        undefined,
        hazardAvoidance,
        holding,
      );

      for (let i = 0; i < N * 2; i++) {
        expect(Math.abs(gpu.positions[i] - cpuAgents.positions[i])).toBeLessThan(1e-3);
      }
      // Decisive: a SEPARATE single-step comparison (not the 20-step
      // trajectory above) against anticipationStrength:0 and no hazard
      // vector at all, from the same initial configuration. Single-step is
      // deliberate: over the full 20-step run, a holding agent's position
      // still drifts a little between these two param sets, NOT because the
      // gate leaked, but because its non-holding NEIGHBOUR receives a real
      // anticipation/hazard push in one run and not the other, ends up
      // somewhere else, and repulsion/sidestep (never gated by holding —
      // only anticipation/hazard are) then differs by proxy through that
      // neighbour's shifted position — a genuine second-order coupling
      // effect, not the gate failing. At exactly one step, a holding
      // agent's own resulting position depends only on the shared, still
      // -identical initial configuration, so this confound cannot occur:
      // if the gate holds, a holding agent's one-step position must be
      // (near-)identical between the two parameter sets; a non-holding
      // agent's must not be.
      const gpuOneStep = await stepForParity(
        device!,
        agents,
        targets,
        walls,
        params,
        layout,
        1,
        undefined,
        undefined,
        hazardAvoidance,
        holding,
      );
      const bareOneStep = await stepForParity(
        device!,
        agents,
        targets,
        walls,
        { ...params, anticipationStrength: 0 },
        layout,
        1,
        undefined,
        undefined,
        undefined,
        holding,
      );
      for (let i = 0; i < N; i++) {
        const dx = gpuOneStep.positions[i * 2] - bareOneStep.positions[i * 2];
        const dy = gpuOneStep.positions[i * 2 + 1] - bareOneStep.positions[i * 2 + 1];
        const diff = Math.hypot(dx, dy);
        if (holding[i] === 1) {
          expect(diff).toBeLessThan(1e-4);
        } else {
          expect(diff).toBeGreaterThan(1e-3);
        }
      }

      device!.destroy();
    },
  );
});
