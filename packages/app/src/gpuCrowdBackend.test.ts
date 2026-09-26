import type { AgentSpawn, GpuSimCore } from "@crowdsim/core-gpu";
import { createGpuSlotAllocator } from "@crowdsim/core-gpu";
import { describe, expect, it } from "vitest";
import { socialForceParameters, stepCrowd } from "./crowdMovement";
import { createRouter } from "./crowdNavigation";
import {
  advanceAgentsGpu,
  buildGpuCrowdUploadArrays,
  createGpuCrowdPlanePool,
  toGpuSimCoreParams,
  type GpuCrowdPlane,
} from "./gpuCrowdBackend";
import type { SimulationAgent } from "./simulationEngine";
import { createWallIndex } from "./wallIndex";

// Self-skips without a real WebGPU adapter -- same precedent as core-gpu's
// own src/index.test.ts (a normal *.test.ts file, not a separate
// test-webgpu/ spec): jsdom's `navigator` has no `.gpu`, so this evaluates
// to `it.skip` in the default `pnpm test` run and executes for real only
// when driven through a real browser (this session's browser-tool harness).
const maybeNavigator = globalThis.navigator as (Navigator & { gpu?: GPU }) | undefined;
const gpuTest = maybeNavigator?.gpu ? it : it.skip;

function agent(overrides: Partial<SimulationAgent> & { id: number }): SimulationAgent {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    targetX: 10,
    targetY: 0,
    ...overrides,
  };
}

const straightLineRouter = {
  direction(from: { x: number; y: number }, to: { x: number; y: number }) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    return length > 1e-9 ? { x: dx / length, y: dy / length } : { x: 0, y: 0 };
  },
};

describe("buildGpuCrowdUploadArrays", () => {
  it("fills targets/speed/holding/routedHeading at each agent's given slot, not its array position", () => {
    const a = agent({ id: 1, x: 0, y: 0, targetX: 10, targetY: 0, speedFactor: 1 });
    const b = agent({ id: 2, x: 5, y: 5, targetX: 5, targetY: 15, speedFactor: 1 });
    // Deliberately reversed slots vs array order: a -> slot 1, b -> slot 0.
    const slots = new Int32Array([1, 0]);
    const arrays = buildGpuCrowdUploadArrays(
      [a, b],
      slots,
      2,
      1.34,
      straightLineRouter,
      1,
    );

    expect(arrays.targets[1 * 2]).toBe(10); // a's target at slot 1
    expect(arrays.targets[0 * 2 + 1]).toBe(15); // b's target at slot 0
    expect(arrays.routedHeading[1 * 2]).toBeCloseTo(1, 6); // a walks +x
    expect(arrays.routedHeading[0 * 2 + 1]).toBeCloseTo(1, 6); // b walks +y
  });

  it("a holding agent gets a straight-line routedHeading, not the router's", () => {
    const holdingAgent = agent({
      id: 1,
      x: 0,
      y: 0,
      targetX: 3,
      targetY: 4,
      lifecycleState: "browse",
    });
    const routerThatAlwaysPointsAway = {
      direction: () => ({ x: -1, y: 0 }),
    };
    const arrays = buildGpuCrowdUploadArrays(
      [holdingAgent],
      new Int32Array([0]),
      1,
      1.34,
      routerThatAlwaysPointsAway,
      1,
    );
    expect(arrays.holding[0]).toBe(1);
    // Straight line to (3,4): unit vector (0.6, 0.8), NOT the router's (-1,0).
    expect(arrays.routedHeading[0]).toBeCloseTo(0.6, 6);
    expect(arrays.routedHeading[1]).toBeCloseTo(0.8, 6);
  });

  it("passes through hazardAvoidance when present, leaves it zero otherwise", () => {
    const exposed = agent({ id: 1, hazardAvoidance: [2, -1] });
    const clear = agent({ id: 2 });
    const arrays = buildGpuCrowdUploadArrays(
      [exposed, clear],
      new Int32Array([0, 1]),
      2,
      1.34,
      straightLineRouter,
      1,
    );
    expect(arrays.hazardAvoidance[0]).toBe(2);
    expect(arrays.hazardAvoidance[1]).toBe(-1);
    expect(arrays.hazardAvoidance[2]).toBe(0);
    expect(arrays.hazardAvoidance[3]).toBe(0);
  });

  it("a grouped, moving pair gets a real groupId and a real formationSlot", () => {
    const a = agent({ id: 1, x: 0, y: 0, targetX: 10, targetY: 0, groupId: 1 });
    const b = agent({ id: 2, x: 0, y: 1, targetX: 10, targetY: 1, groupId: 1 });
    const arrays = buildGpuCrowdUploadArrays(
      [a, b],
      new Int32Array([0, 1]),
      2,
      1.34,
      straightLineRouter,
      1,
    );
    expect(arrays.groupIds[0]).toBe(1);
    expect(arrays.groupIds[1]).toBe(1);
    // formationSlots must actually differ from (0,0) -- a real slot, not
    // the zero-initialized default a suppressed group would leave behind.
    expect(arrays.formationSlots[0] !== 0 || arrays.formationSlots[1] !== 0).toBe(true);
  });

  it("decisive: a defined groupId with NO formation slot (a solo group member) must upload groupId -1, not its real id", () => {
    // crowdMovement.ts's own formation force is gated on
    // groupFormation(agents).slots.has(agent.id) (excludes a solo member --
    // groupFormation itself skips any group with fewer than 2 movers), but
    // the GPU kernel's gate is only groupIds[i] >= 0. Uploading this
    // agent's real groupId would let the kernel apply a formation pull
    // toward (0, 0) (formationSlots' zero-initialized default) that CPU
    // never would for this same agent -- a real, silent behavioural
    // divergence if not corrected here.
    const solo = agent({ id: 1, x: 5, y: 5, targetX: 15, targetY: 5, groupId: 7 });
    const arrays = buildGpuCrowdUploadArrays(
      [solo],
      new Int32Array([0]),
      1,
      1.34,
      straightLineRouter,
      1,
    );
    expect(arrays.groupIds[0]).toBe(-1);
  });

  it("resolves radius/speedFactor via the same fallback stepCrowd uses when absent, and preserves them when already set", () => {
    const withoutFields = agent({ id: 1 });
    const withFields = agent({ id: 2, radius: 0.3, speedFactor: 1.5 });
    const arrays = buildGpuCrowdUploadArrays(
      [withoutFields, withFields],
      new Int32Array([0, 1]),
      2,
      1.34,
      straightLineRouter,
      42,
    );
    expect(arrays.radii[0]).toBeGreaterThan(0); // sampled, not NaN/0
    expect(arrays.speedFactors[0]).toBeGreaterThan(0);
    // toBeCloseTo, not toBe: these are Float32Array entries, and 0.3 has no
    // exact float32 representation (same lesson as coreApi.webgpu.ts's
    // vx/vy test, caught there on real hardware).
    expect(arrays.radii[1]).toBeCloseTo(0.3, 6);
    expect(arrays.speedFactors[1]).toBe(1.5); // 1.5 IS exactly representable in float32
  });
});

// A minimal in-memory GpuSimCore double: no real GPU device, deterministic
// "walk straight at 1 m/s toward whatever target was last uploaded" model.
// Exists to test advanceAgentsGpu's ORCHESTRATION (slot mapping, spawn/
// relocation upload triggering, wall-constraint reapplication, exit
// handling) without needing real hardware -- physics correctness itself is
// verified separately, on real hardware, against stepCrowd.
function createFakeGpuSimCore(capacity: number) {
  const positions = new Float32Array(capacity * 2);
  const velocities = new Float32Array(capacity * 2);
  let targets: Float32Array<ArrayBufferLike> = new Float32Array(capacity * 2);
  let count = 0;
  const spawnCalls: AgentSpawn[][] = [];
  const core: GpuSimCore = {
    uploadSpawns(spawns) {
      spawnCalls.push(spawns);
      for (const spawn of spawns) {
        positions[spawn.index * 2] = spawn.x;
        positions[spawn.index * 2 + 1] = spawn.y;
        velocities[spawn.index * 2] = spawn.vx ?? 0;
        velocities[spawn.index * 2 + 1] = spawn.vy ?? 0;
      }
    },
    uploadGroupIds() {},
    uploadFormationSlots() {},
    uploadHazardAvoidance() {},
    uploadHolding() {},
    uploadRoutedHeading() {},
    uploadTargets(next) {
      targets = next;
    },
    uploadSpeeds() {},
    setCount(next) {
      count = next;
    },
    step(dt) {
      for (let i = 0; i < count; i++) {
        const dx = targets[i * 2] - positions[i * 2];
        const dy = targets[i * 2 + 1] - positions[i * 2 + 1];
        const distance = Math.hypot(dx, dy);
        if (distance < 1e-9) {
          velocities[i * 2] = 0;
          velocities[i * 2 + 1] = 0;
          continue;
        }
        const speed = Math.min(1, distance / dt);
        velocities[i * 2] = (dx / distance) * speed;
        velocities[i * 2 + 1] = (dy / distance) * speed;
        positions[i * 2] += velocities[i * 2] * dt;
        positions[i * 2 + 1] += velocities[i * 2 + 1] * dt;
      }
    },
    positionsBuffer(): never {
      throw new Error("not implemented in fake");
    },
    async readAggregates(): Promise<never> {
      throw new Error("not implemented in fake");
    },
    async readback() {
      return {
        positions: new Float32Array(positions.slice(0, count * 2)),
        velocities: new Float32Array(velocities.slice(0, count * 2)),
      };
    },
    destroy() {},
  };
  return { core, spawnCalls };
}

const straightWorld = { width: 100, height: 100 };

describe("advanceAgentsGpu (orchestration, fake GpuSimCore -- no real GPU needed)", () => {
  it("removes an exit-bound agent within its exit radius before it ever reaches the GPU plane", async () => {
    const { core, spawnCalls } = createFakeGpuSimCore(4);
    const allocator = createGpuSlotAllocator();
    const plane: GpuCrowdPlane = { core, allocator };
    const exitedSinkIds: string[] = [];

    const departing = agent({
      id: 1,
      x: 0,
      y: 0,
      targetX: 0.05,
      targetY: 0,
      targetSinkId: "door-a",
    });
    const result = await advanceAgentsGpu({
      plane,
      agents: [departing],
      dtSeconds: 1 / 60,
      meanSpeedMetersPerSecond: 1.34,
      router: straightLineRouter,
      wallIndex: createWallIndex([]),
      world: straightWorld,
      seed: 1,
      isExitBound: () => true,
      exitRadius: () => 0.5,
      exitedSinkIds,
    });

    expect(result.exitedCount).toBe(1);
    expect(result.agents).toEqual([]);
    expect(exitedSinkIds).toEqual(["door-a"]);
    expect(spawnCalls).toEqual([]); // never touched the GPU plane at all
  });

  it("a brand-new agent is uploaded via uploadSpawns and comes back moved after step+readback", async () => {
    const { core, spawnCalls } = createFakeGpuSimCore(4);
    const allocator = createGpuSlotAllocator();
    const plane: GpuCrowdPlane = { core, allocator };

    const walker = agent({ id: 1, x: 0, y: 0, targetX: 10, targetY: 0 });
    const result = await advanceAgentsGpu({
      plane,
      agents: [walker],
      dtSeconds: 1 / 60,
      meanSpeedMetersPerSecond: 1.34,
      router: straightLineRouter,
      wallIndex: createWallIndex([]),
      world: straightWorld,
      seed: 1,
      isExitBound: () => false,
      exitRadius: () => 0.5,
    });

    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0][0].x).toBe(0);
    expect(spawnCalls[0][0].vx).toBe(0); // brand new: starts at rest
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].x).toBeGreaterThan(0); // moved toward target
  });

  it("a continuing agent (same slot both ticks) is NOT re-uploaded via uploadSpawns on its second tick", async () => {
    const { core, spawnCalls } = createFakeGpuSimCore(4);
    const allocator = createGpuSlotAllocator();
    const plane: GpuCrowdPlane = { core, allocator };

    const walker = agent({ id: 1, x: 0, y: 0, targetX: 10, targetY: 0 });
    const first = await advanceAgentsGpu({
      plane,
      agents: [walker],
      dtSeconds: 1 / 60,
      meanSpeedMetersPerSecond: 1.34,
      router: straightLineRouter,
      wallIndex: createWallIndex([]),
      world: straightWorld,
      seed: 1,
      isExitBound: () => false,
      exitRadius: () => 0.5,
    });
    expect(spawnCalls).toHaveLength(1); // tick 1: new arrival

    await advanceAgentsGpu({
      plane,
      agents: first.agents,
      dtSeconds: 1 / 60,
      meanSpeedMetersPerSecond: 1.34,
      router: straightLineRouter,
      wallIndex: createWallIndex([]),
      world: straightWorld,
      seed: 1,
      isExitBound: () => false,
      exitRadius: () => 0.5,
    });
    expect(spawnCalls).toHaveLength(1); // tick 2: same slot, no re-upload
  });

  it("the hard wall constraint is reapplied to the GPU-produced position, exactly as stepCrowd does", async () => {
    const { core } = createFakeGpuSimCore(4);
    const allocator = createGpuSlotAllocator();
    const plane: GpuCrowdPlane = { core, allocator };

    // A wall directly between the walker and its target -- the fake core's
    // own step() has no concept of walls, so any blocking must come from
    // advanceAgentsGpu's own post-readback constrainMovement call.
    const wallIndex = createWallIndex([{ x1: 0.5, y1: -5, x2: 0.5, y2: 5 }]);
    const walker = agent({ id: 1, x: 0, y: 0, targetX: 10, targetY: 0 });
    const result = await advanceAgentsGpu({
      plane,
      agents: [walker],
      dtSeconds: 1, // a full 1s step at 1 m/s would cross the wall at x=0.5
      meanSpeedMetersPerSecond: 1.34,
      router: straightLineRouter,
      wallIndex,
      world: straightWorld,
      seed: 1,
      isExitBound: () => false,
      exitRadius: () => 0.5,
    });

    expect(result.agents[0].x).toBeLessThan(0.5);
  });
});

// ADR-0033 stage 2's own verification plan: run both backends against the
// same scene/seed and compare positions within the disclosed tolerance.
// Real hardware only -- self-skips otherwise (see `gpuTest` above).
describe("advanceAgentsGpu vs stepCrowd (real WebGPU, same scenario)", () => {
  gpuTest(
    "matches the CPU backend within tolerance over 30 ticks, for a mixed scenario (walking group, solo walker, holding agent, head-on pair)",
    async () => {
      const adapter = await maybeNavigator?.gpu?.requestAdapter();
      const device = await adapter?.requestDevice({
        requiredLimits: { maxStorageBuffersPerShaderStage: 16 },
      });
      expect(device).toBeDefined();

      const world = { width: 80, height: 20 };
      const router = createRouter(world, []); // no walls -> straight-line router
      const wallIndex = createWallIndex([]);
      const dt = 1 / 60;
      const meanSpeed = 1.34;

      const makeScenario = (): SimulationAgent[] => [
        // A walking pair in a group.
        agent({
          id: 1,
          x: 5,
          y: 8,
          targetX: 70,
          targetY: 8,
          groupId: 100,
          radius: 0.22,
          speedFactor: 1,
        }),
        agent({
          id: 2,
          x: 5,
          y: 9,
          targetX: 70,
          targetY: 9,
          groupId: 100,
          radius: 0.22,
          speedFactor: 1,
        }),
        // A solo walker, far from the group.
        agent({
          id: 3,
          x: 5,
          y: 16,
          targetX: 70,
          targetY: 16,
          radius: 0.22,
          speedFactor: 1,
        }),
        // A holding (browsing) agent near its own hold spot.
        agent({
          id: 4,
          x: 40,
          y: 2,
          targetX: 40.3,
          targetY: 2,
          lifecycleState: "browse",
          radius: 0.22,
          speedFactor: 1,
        }),
        // A head-on collision pair -- exercises repulsion, sidestep, and
        // anticipation.
        agent({
          id: 5,
          x: 20,
          y: 12,
          targetX: 70,
          targetY: 12,
          radius: 0.22,
          speedFactor: 1,
        }),
        agent({
          id: 6,
          x: 60,
          y: 12.3,
          targetX: 5,
          targetY: 12.3,
          radius: 0.22,
          speedFactor: 1,
        }),
      ];

      let cpuAgents = makeScenario();
      for (let tick = 0; tick < 30; tick++) {
        const result = stepCrowd({
          agents: cpuAgents,
          dtSeconds: dt,
          meanSpeedMetersPerSecond: meanSpeed,
          router,
          seed: 1,
          walls: wallIndex,
          world,
          isExitBound: () => false,
          exitRadius: () => 0,
          // Force every tick to recompute anticipation -- the GPU kernel
          // always does (ADR-0015 gap #7, a disclosed difference), so
          // matching that here keeps this comparison from being confounded
          // by CPU's own 3-tick throttle.
          replanAnticipation: true,
        });
        cpuAgents = result.agents;
      }

      const pool = createGpuCrowdPlanePool(device!, {
        capacity: 8,
        params: toGpuSimCoreParams(socialForceParameters, dt),
      });
      const plane = pool.forPlane(undefined, [], world);

      let gpuAgents = makeScenario();
      for (let tick = 0; tick < 30; tick++) {
        const result = await advanceAgentsGpu({
          plane,
          agents: gpuAgents,
          dtSeconds: dt,
          meanSpeedMetersPerSecond: meanSpeed,
          router,
          wallIndex,
          world,
          seed: 1,
          isExitBound: () => false,
          exitRadius: () => 0,
        });
        gpuAgents = result.agents;
      }

      const cpuById = new Map(cpuAgents.map((agent) => [agent.id, agent]));
      let maxDiff = 0;
      for (const gpuAgent of gpuAgents) {
        const cpuAgent = cpuById.get(gpuAgent.id)!;
        const diff = Math.hypot(gpuAgent.x - cpuAgent.x, gpuAgent.y - cpuAgent.y);
        maxDiff = Math.max(maxDiff, diff);
      }
      expect(maxDiff).toBeLessThan(0.05);

      // Decisive: everyone must have actually moved from their spawn point
      // (except the holding agent, which should have stayed almost exactly
      // put) -- ruling out a silently-dead pipeline passing vacuously.
      const spawn = new Map(makeScenario().map((agent) => [agent.id, agent]));
      for (const gpuAgent of gpuAgents) {
        const start = spawn.get(gpuAgent.id)!;
        const moved = Math.hypot(gpuAgent.x - start.x, gpuAgent.y - start.y);
        if (gpuAgent.id === 4) {
          expect(moved).toBeLessThan(0.5); // holding: stays near its spot
        } else {
          // 30 ticks is only 0.5 simulated seconds -- less than the 0.644s
          // relaxation time, so a walker is still accelerating from rest,
          // not yet at its ~1.34 m/s free speed (an earlier, unrealistic
          // threshold of "> 1m" failed on real hardware for exactly this
          // reason, not because nobody moved: actual displacement was
          // ~0.21m, matching the CPU backend within 1.1e-5m).
          expect(moved).toBeGreaterThan(0.1); // walking: genuinely progressed
        }
      }

      pool.destroyAll();
      device!.destroy();
    },
  );
});
