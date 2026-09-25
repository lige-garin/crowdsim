import { describe, expect, it } from "vitest";
import {
  createAgentSoA,
  createGpuSimCore,
  createSpatialHashGridLayout,
  setAgentPosition,
  setAgentRadius,
  setAgentSpeed,
  type AgentSpawn,
  type GpuSimCoreSocialForceParams,
} from "../src/index";
import { stepForParity } from "../src/gpuSimCore";

// Self-skips without a real WebGPU adapter (see test-webgpu/README.md).
const maybeNavigator = globalThis.navigator as (Navigator & { gpu?: GPU }) | undefined;
const gpuTest = maybeNavigator?.gpu ? it : it.skip;

// ADR-0033 stage 1: `GpuSimCore`'s public API (uploadSpawns +
// uploadGroupIds/uploadFormationSlots/uploadHazardAvoidance/uploadHolding/
// uploadRoutedHeading + step + readback) had never been exercised end-to-end
// against real hardware before this fix — its bind group only wired 11 of
// the 16 bindings `createMovePipeline` requires, and there was no public
// write path or persistent readback for the group/formation/hazard/
// holding/routedHeading buffers at all. This test drives the PUBLIC API
// exactly as a future engine integration (ADR-0033 stage 2) would, and
// checks its output against `stepForParity` — the internal test/benchmark
// harness that was kept in sync with every ADR-0015 stage — for the
// identical inputs. If `GpuSimCore`'s bind group or buffer layout is wrong
// in any way (stale binding count, wrong byte offset, wrong default value),
// this diverges from the oracle; if it's right, they must match within the
// same tolerance every other real-hardware parity test in this suite uses.
describe("GpuSimCore public API parity with stepForParity (real WebGPU)", () => {
  gpuTest(
    "uploadSpawns + uploadGroupIds/uploadFormationSlots/uploadHazardAvoidance/uploadHolding/uploadRoutedHeading + step + readback matches stepForParity over 20 steps",
    async () => {
      const adapter = await maybeNavigator?.gpu?.requestAdapter();
      const device = await adapter?.requestDevice({
        requiredLimits: { maxStorageBuffersPerShaderStage: 16 },
      });
      expect(device).toBeDefined();

      // A mixed fixture exercising every one of the four buffers this test
      // is here to prove work: pairs close enough to interact (repulsion,
      // sidestep, anticipation all engage), alternating group membership
      // (formation force), a nonzero hazard push on half the agents, and
      // holding on every third agent (stage 6/7/8's own mixing ratio).
      const N = 20;
      const agents = createAgentSoA(N);
      const targets = new Float32Array(N * 2);
      const groupIds = new Int32Array(N);
      const formationSlots = new Float32Array(N * 2);
      const hazardAvoidance = new Float32Array(N * 2);
      const holding = new Uint32Array(N);
      // ADR-0033: an explicit, straight-line routedHeading (correct here
      // since this fixture has no walls — nothing to route around) fed to
      // BOTH paths identically, rather than relying on GpuSimCore's "no
      // default, zero until uploaded" and stepForParity's "computed once,
      // internally" defaults to happen to agree.
      const routedHeading = new Float32Array(N * 2);
      for (let pair = 0; pair < N / 2; pair++) {
        const y = 5 + pair * 1.5;
        const a = pair * 2;
        const b = pair * 2 + 1;
        setAgentPosition(agents, a, 10, y);
        setAgentPosition(agents, b, 10.6, y);
        setAgentSpeed(agents, a, 1.34);
        setAgentSpeed(agents, b, 1.34);
        setAgentRadius(agents, a, 0.22);
        setAgentRadius(agents, b, 0.22);
        targets[a * 2] = 40;
        targets[a * 2 + 1] = y;
        targets[b * 2] = -20;
        targets[b * 2 + 1] = y;
        groupIds[a] = pair;
        groupIds[b] = pair;
        formationSlots[a * 2] = 10 - 0.4;
        formationSlots[a * 2 + 1] = y;
        formationSlots[b * 2] = 10.6 + 0.4;
        formationSlots[b * 2 + 1] = y;
        hazardAvoidance[a * 2] = a % 2 === 0 ? 0.5 : -0.5;
        hazardAvoidance[b * 2 + 1] = 0.3;
        holding[a] = a % 3 === 0 ? 1 : 0;
        holding[b] = b % 3 === 0 ? 1 : 0;
        routedHeading[a * 2] = 1; // toward +x, matching agent a's target
        routedHeading[b * 2] = -1; // toward -x, matching agent b's target
      }
      const walls: never[] = [];
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
      const STEPS = 20;

      const oracle = await stepForParity(
        device!,
        agents,
        targets,
        walls,
        params,
        layout,
        STEPS,
        groupIds,
        formationSlots,
        hazardAvoidance,
        holding,
        routedHeading,
      );

      const core = createGpuSimCore(device!, { capacity: N, layout, walls, params });
      const spawns: AgentSpawn[] = Array.from({ length: N }, (_, i) => ({
        index: i,
        x: agents.positions[i * 2],
        y: agents.positions[i * 2 + 1],
        speed: agents.speed[i],
        radius: agents.radius[i],
        targetX: targets[i * 2],
        targetY: targets[i * 2 + 1],
      }));
      core.setCount(N);
      core.uploadSpawns(spawns);
      core.uploadGroupIds(groupIds);
      core.uploadFormationSlots(formationSlots);
      core.uploadHazardAvoidance(hazardAvoidance);
      core.uploadHolding(holding);
      core.uploadRoutedHeading(routedHeading);
      for (let s = 0; s < STEPS; s++) {
        core.step(params.dt);
      }
      const result = await core.readback();

      let maxDiff = 0;
      for (let i = 0; i < N * 2; i++) {
        maxDiff = Math.max(
          maxDiff,
          Math.abs(result.positions[i] - oracle.positions[i]),
        );
        expect(Math.abs(result.positions[i] - oracle.positions[i])).toBeLessThan(1e-3);
        expect(Math.abs(result.velocities[i] - oracle.velocities[i])).toBeLessThan(
          1e-3,
        );
      }
      // Decisive: at least one holding and one non-holding agent must have
      // actually moved, or this test would pass vacuously against a dead
      // pipeline (same lesson stage 3 of ADR-0015 learned the hard way).
      let anyMoved = false;
      for (let i = 0; i < N; i++) {
        const dx = result.positions[i * 2] - agents.positions[i * 2];
        const dy = result.positions[i * 2 + 1] - agents.positions[i * 2 + 1];
        if (Math.hypot(dx, dy) > 1e-4) {
          anyMoved = true;
          break;
        }
      }
      expect(anyMoved).toBe(true);
      expect(maxDiff).toBeLessThan(1e-3);

      core.destroy();
      device!.destroy();
    },
  );
});
