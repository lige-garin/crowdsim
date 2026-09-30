import {
  createGpuSimCore,
  createSpatialHashGridLayout,
  type GpuSimCoreSocialForceParams,
  type WallSegment,
} from "../src/index";

/**
 * `updateWalls` scenario, shared by the vitest spec and by a browser harness
 * (a spec cannot be imported outside vitest). Six agents walk at a wall with a
 * wide soft-repulsion range so the wall visibly changes their motion:
 *  - `withWall`: a core built with the wall,
 *  - `updated`: a core built without it and given the wall by `updateWalls`,
 *  - `noWall`: a core that never has it.
 * The first two must agree exactly; the third must not.
 */
export async function runUpdateWallsScenario(device: GPUDevice) {
  const params: GpuSimCoreSocialForceParams = {
    dt: 1 / 60,
    desiredSpeed: 1.34,
    relaxationTime: 0.644,
    agentRepulsionStrength: 1.966,
    agentRepulsionRange: 0.307,
    wallRepulsionStrength: 3,
    wallRepulsionRange: 1.5,
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
  const layout = createSpatialHashGridLayout({ width: 32, height: 32, cellSize: 4 });
  const wall: WallSegment = { x1: 10, y1: 4, x2: 10, y2: 28 };
  const n = 6;
  const spawns = Array.from({ length: n }, (_, i) => ({
    index: i,
    x: 9,
    y: 8 + i * 3,
    vx: 0,
    vy: 0,
    speed: 1.34,
    radius: 0.22,
    targetX: 25,
    targetY: 8 + i * 3,
  }));
  const heading = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) heading[i * 2] = 1;

  async function run(core: ReturnType<typeof createGpuSimCore>) {
    core.setCount(n);
    core.uploadSpawns(spawns);
    core.uploadRoutedHeading(heading);
    for (let s = 0; s < 40; s++) core.step(1 / 60);
    return (await core.readback()).positions;
  }
  const make = (walls: WallSegment[]) =>
    createGpuSimCore(device, { capacity: 8, layout, walls, params });

  const withWallCore = make([wall]);
  const updatedCore = make([]);
  const noWallCore = make([]);
  const accepted = updatedCore.updateWalls([wall]);
  const tooMany = Array.from({ length: 65 }, () => wall);
  const declined = updatedCore.updateWalls(tooMany);

  const withWall = await run(withWallCore);
  const updated = await run(updatedCore);
  const noWall = await run(noWallCore);
  for (const core of [withWallCore, updatedCore, noWallCore]) core.destroy();

  const maxDiff = (a: Float32Array, b: Float32Array) => {
    let m = 0;
    for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
    return m;
  };
  return {
    accepted,
    declined,
    updatedVsWithWall: maxDiff(updated, withWall),
    noWallVsWithWall: maxDiff(noWall, withWall),
  };
}
