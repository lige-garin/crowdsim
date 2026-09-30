import { socialForceParameters, stepCrowd } from "./crowdMovement";
import { createRouter } from "./crowdNavigation";
import {
  advanceAgentsGpu,
  createGpuCrowdPlanePool,
  toGpuSimCoreParams,
} from "./gpuCrowdBackend";
import type { SimulationAgent } from "./simulationEngine";
import { createWallIndex } from "./wallIndex";

/**
 * CPU `stepCrowd` against GPU `advanceAgentsGpu` from the same start, for the
 * two situations that used to differ and that the mixed-scenario parity test
 * does not contain. Shared by the vitest spec and a browser harness, since a
 * spec cannot be imported outside vitest.
 *
 *  - `wallHugger`: an agent walking 0.45 m from a long wall. The GPU kernel's
 *    wall push was a linear stand-in that reached about 0.2 m, while the CPU
 *    pushes exponentially out to a metre and adds contact stiffness.
 *  - `browsingCompanion`: three groupmates side by side, the middle one
 *    browsing. A browsing companion has no formation slot, and the upload used
 *    to send it as ungrouped, so it repelled its own group on the GPU only.
 *
 * Returns the largest position difference for each, in metres.
 */
export async function runCpuVsGpuScenarios(device: GPUDevice) {
  const dt = 1 / 60;
  const steps = 120;

  async function compare(
    world: { width: number; height: number },
    walls: { x1: number; y1: number; x2: number; y2: number }[],
    make: () => SimulationAgent[],
  ) {
    const router = createRouter(world, walls);
    const wallIndex = createWallIndex(walls);
    let cpu = make();
    let gpu = make();
    const pool = createGpuCrowdPlanePool(device, {
      capacity: 16,
      params: toGpuSimCoreParams(socialForceParameters, dt),
    });
    const plane = pool.forPlane(undefined, walls, world);
    let maxDiff = 0;
    for (let t = 0; t < steps; t++) {
      cpu = stepCrowd({
        agents: cpu,
        dtSeconds: dt,
        meanSpeedMetersPerSecond: 1.34,
        router,
        seed: 1,
        walls: wallIndex,
        world,
        isExitBound: () => false,
        exitRadius: () => 0,
        replanAnticipation: true,
      }).agents;
      gpu = (
        await advanceAgentsGpu({
          plane,
          agents: gpu,
          dtSeconds: dt,
          meanSpeedMetersPerSecond: 1.34,
          router,
          wallIndex,
          world,
          seed: 1,
          isExitBound: () => false,
          exitRadius: () => 0,
        })
      ).agents;
      for (let i = 0; i < cpu.length; i++) {
        maxDiff = Math.max(
          maxDiff,
          Math.hypot(cpu[i].x - gpu[i].x, cpu[i].y - gpu[i].y),
        );
      }
    }
    pool.destroyAll();
    return maxDiff;
  }

  const agent = (fields: Partial<SimulationAgent> & { id: number }) =>
    ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      targetX: 0,
      targetY: 0,
      radius: 0.22,
      speedFactor: 1,
      ...fields,
    }) as SimulationAgent;

  const wallHugger = await compare(
    { width: 60, height: 30 },
    [{ x1: 0, y1: 10, x2: 50, y2: 10 }],
    () => [agent({ id: 1, x: 10, y: 10.45, targetX: 35, targetY: 10.3 })],
  );

  const browsingCompanion = await compare({ width: 60, height: 30 }, [], () => [
    agent({ id: 1, x: 10, y: 10, targetX: 35, targetY: 10, groupId: 9 }),
    agent({
      id: 2,
      x: 10,
      y: 10.5,
      vx: 1,
      targetX: 12,
      targetY: 10.5,
      groupId: 9,
      lifecycleState: "browse",
    }),
    agent({ id: 3, x: 10, y: 11, targetX: 35, targetY: 11, groupId: 9 }),
  ]);

  return { wallHugger, browsingCompanion };
}
