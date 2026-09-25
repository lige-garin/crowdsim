import {
  createStorageBuffer,
  createWallsBufferData,
  enqueueCopyToReadbackBuffer,
  readFloat32Array,
  readUint32Array,
} from "./gpuUtils";
import {
  FUSED_MOVE_WORKGROUP,
  SCAN_WORKGROUP,
  SORT_WORKGROUP,
} from "./gpuSimCoreShaders";
import { maxUint32 } from "./mathUtils";
import type { SpatialHashGridLayout, WallSegment } from "./types";
import type { GpuSimCoreSocialForceParams } from "./gpuSimCoreSocialForce";
import {
  F32,
  U32,
  buildGridParamsData,
  buildMoveParamsData,
  createMovePipeline,
  createSortPipelines,
} from "./gpuSimCorePipelines";
export { sortAgentsForParity, stepForParity } from "./gpuSimCoreParity";
export type { SortParityReadback, StepParityReadback } from "./gpuSimCoreParity";
export type AgentSpawn = {
  index: number;
  x: number;
  y: number;
  speed: number;
  targetX: number;
  targetY: number;
  /** Body radius, m — feeds the contact-stiffness term (`gpuSimCoreSocialForce.ts`). */
  radius: number;
};
export type GpuSimCoreOptions = {
  capacity: number;
  layout: SpatialHashGridLayout;
  walls: WallSegment[];
  params: GpuSimCoreSocialForceParams;
};
export type GpuSimCore = {
  uploadSpawns(spawns: AgentSpawn[]): void;
  /**
   * ADR-0015 stage 2's group-formation input — one i32 per agent, index 0
   * to count-1 written from offset 0 each call (not run-coalesced like
   * `uploadSpawns`: unlike spawning, holding/hazard/group state changes for
   * most live agents most ticks, so a full rewrite is both simpler and no
   * more expensive than diffing). -1 means "not in a group", which gates
   * the formation force off before `formationSlots` is ever read.
   */
  uploadGroupIds(groupIds: Int32Array): void;
  /** ADR-0015 stage 2's per-agent formation-slot target, (x, y) per agent. */
  uploadFormationSlots(formationSlots: Float32Array): void;
  /** ADR-0015 stage 5's precomputed per-agent avoidance push, (x, y) per agent. */
  uploadHazardAvoidance(hazardAvoidance: Float32Array): void;
  /** ADR-0015 stage 6's holding-state flag — 0 or 1 per agent. */
  uploadHolding(holding: Uint32Array): void;
  setCount(count: number): void;
  step(dt: number): void;
  positionsBuffer(): GPUBuffer;
  readAggregates(): Promise<{ cellCounts: Uint32Array; maxCount: number }>;
  /**
   * Persistent-buffer positions+velocities readback for the current agent
   * count, built once at construction and reused every call — unlike
   * `gpuSimCoreParity.ts`'s `stepForParity` (which allocates, copies, maps,
   * and destroys fresh readback buffers per one-shot benchmark run), a
   * resident engine backend calls this every tick (ADR-0033: floor
   * transfers, vehicle stepping, exit tallying, and analytics all need a
   * real CPU-side agent array regardless of which backend computed the
   * movement, so "no readback" was never preservable once this became a
   * real engine citizen, only in the standalone step-kernel benchmark).
   */
  readback(): Promise<{ positions: Float32Array; velocities: Float32Array }>;
  destroy(): void;
};
export function createGpuSimCore(
  device: GPUDevice,
  opts: GpuSimCoreOptions,
): GpuSimCore {
  const { capacity, layout, walls, params } = opts;
  if (params.interactionRangeMeters > layout.cellSize) {
    throw new Error(
      "interactionRangeMeters must be <= cellSize for the 3x3 neighborhood to be exact",
    );
  }
  const cellCount = layout.cellCount;
  const blocks = Math.max(1, Math.ceil(cellCount / SCAN_WORKGROUP));
  const wallCount = walls.length;
  const posBuffers = [0, 1].map((i) =>
    createStorageBuffer(
      device,
      `core-positions-${i}`,
      capacity * 2 * F32,
      GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    ),
  );
  const velBuffers = [0, 1].map((i) =>
    createStorageBuffer(
      device,
      `core-velocities-${i}`,
      capacity * 2 * F32,
      // COPY_SRC is required by readback()'s copyBufferToBuffer below —
      // without it that copy is an invalid GPU command that fails via an
      // uncaptured error event, not a thrown JS exception, so the caller
      // gets back stale (zero-initialized) data with no visible signal
      // unless something pushes an error scope around it (readback() does).
      GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    ),
  );
  const speedBuffer = createStorageBuffer(
    device,
    "core-speed",
    capacity * F32,
    GPUBufferUsage.COPY_DST,
  );
  const radiiBuffer = createStorageBuffer(
    device,
    "core-radii",
    capacity * F32,
    GPUBufferUsage.COPY_DST,
  );
  const targetsBuffer = createStorageBuffer(
    device,
    "core-targets",
    capacity * 2 * F32,
    GPUBufferUsage.COPY_DST,
  );
  // ADR-0015 stages 2/5/6: always bound (the shader has no way to omit a
  // binding), harmless by default (group id -1 = ungrouped gates the
  // formation force off before formationSlots is read; an all-zero hazard
  // vector is a no-op add; holding 0 = not holding) — same reasoning as
  // `gpuSimCoreParity.ts`'s `stepForParity`.
  const groupIdsBuffer = createStorageBuffer(
    device,
    "core-group-ids",
    capacity * 4,
    GPUBufferUsage.COPY_DST,
  );
  const formationSlotsBuffer = createStorageBuffer(
    device,
    "core-formation-slots",
    capacity * 2 * F32,
    GPUBufferUsage.COPY_DST,
  );
  const hazardAvoidanceBuffer = createStorageBuffer(
    device,
    "core-hazard-avoidance",
    capacity * 2 * F32,
    GPUBufferUsage.COPY_DST,
  );
  const holdingBuffer = createStorageBuffer(
    device,
    "core-holding",
    capacity * U32,
    GPUBufferUsage.COPY_DST,
  );
  const wallsBuffer = createStorageBuffer(
    device,
    "core-walls",
    Math.max(1, wallCount) * 4 * F32,
    GPUBufferUsage.COPY_DST,
  );
  const gridParamsBuffer = device.createBuffer({
    label: "core-grid-params",
    size: 20,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const moveParamsBuffer = device.createBuffer({
    label: "core-move-params",
    size: 100,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const cellCountsBuffer = createStorageBuffer(
    device,
    "core-cell-counts",
    cellCount * U32,
    GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  );
  const cellOffsetsBuffer = createStorageBuffer(
    device,
    "core-cell-offsets",
    (cellCount + 1) * U32,
    GPUBufferUsage.COPY_DST,
  );
  const blockTotalsBuffer = createStorageBuffer(
    device,
    "core-block-totals",
    blocks * U32,
    GPUBufferUsage.COPY_DST,
  );
  const metaBuffer = createStorageBuffer(
    device,
    "core-meta",
    U32,
    GPUBufferUsage.COPY_DST,
  );
  const cellCursorBuffer = createStorageBuffer(
    device,
    "core-cell-cursor",
    cellCount * U32,
    GPUBufferUsage.COPY_DST,
  );
  const sortedAgentIdsBuffer = createStorageBuffer(
    device,
    "core-sorted-agent-ids",
    capacity * U32,
    GPUBufferUsage.STORAGE,
  );
  // Persistent readback destinations for `readback()` — created once and
  // reused every call, unlike `stepForParity`'s allocate-per-benchmark-run
  // pattern. MAP_READ can't be OR'd with STORAGE (`createStorageBuffer`
  // always adds STORAGE), so these are plain buffers.
  const positionsReadbackBuffer = device.createBuffer({
    label: "core-positions-readback",
    size: capacity * 2 * F32,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const velocitiesReadbackBuffer = device.createBuffer({
    label: "core-velocities-readback",
    size: capacity * 2 * F32,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  let count = 0;
  let cur = 0;
  let dt = params.dt;
  device.queue.writeBuffer(gridParamsBuffer, 0, buildGridParamsData(count, layout));
  device.queue.writeBuffer(
    moveParamsBuffer,
    0,
    buildMoveParamsData(count, layout, params, wallCount),
  );
  device.queue.writeBuffer(metaBuffer, 0, new Uint32Array([cellCount]));
  // GPU buffers are zero-initialized by spec, which is already the correct
  // default for formationSlots/hazardAvoidance/holding — only groupIds
  // needs an explicit fill, since 0 would mean "in group 0", not
  // "ungrouped" (that's -1).
  device.queue.writeBuffer(groupIdsBuffer, 0, new Int32Array(capacity).fill(-1));
  if (wallCount > 0) {
    device.queue.writeBuffer(wallsBuffer, 0, createWallsBufferData(walls));
  }
  const sort = createSortPipelines(device);
  const move = createMovePipeline(device);
  const scanBindGroup = device.createBindGroup({
    layout: sort.scanLayout,
    entries: [
      { binding: 0, resource: { buffer: cellCountsBuffer } },
      { binding: 1, resource: { buffer: cellOffsetsBuffer } },
      { binding: 2, resource: { buffer: blockTotalsBuffer } },
      { binding: 3, resource: { buffer: metaBuffer } },
    ],
  });
  const countBindGroups = [0, 1].map((side) =>
    device.createBindGroup({
      layout: sort.countLayout,
      entries: [
        { binding: 0, resource: { buffer: gridParamsBuffer } },
        { binding: 1, resource: { buffer: posBuffers[side] } },
        { binding: 2, resource: { buffer: cellCountsBuffer } },
      ],
    }),
  );
  const scatterBindGroups = [0, 1].map((side) =>
    device.createBindGroup({
      layout: sort.scatterLayout,
      entries: [
        { binding: 0, resource: { buffer: gridParamsBuffer } },
        { binding: 1, resource: { buffer: posBuffers[side] } },
        { binding: 2, resource: { buffer: cellOffsetsBuffer } },
        { binding: 3, resource: { buffer: cellCursorBuffer } },
        { binding: 4, resource: { buffer: sortedAgentIdsBuffer } },
      ],
    }),
  );
  const moveBindGroups = [0, 1].map((side) => {
    const other = side ^ 1;
    return device.createBindGroup({
      layout: move.layout,
      entries: [
        { binding: 0, resource: { buffer: moveParamsBuffer } },
        { binding: 1, resource: { buffer: posBuffers[side] } },
        { binding: 2, resource: { buffer: velBuffers[side] } },
        { binding: 3, resource: { buffer: targetsBuffer } },
        { binding: 4, resource: { buffer: speedBuffer } },
        { binding: 5, resource: { buffer: radiiBuffer } },
        { binding: 6, resource: { buffer: cellOffsetsBuffer } },
        { binding: 7, resource: { buffer: sortedAgentIdsBuffer } },
        { binding: 8, resource: { buffer: wallsBuffer } },
        { binding: 9, resource: { buffer: posBuffers[other] } },
        { binding: 10, resource: { buffer: velBuffers[other] } },
        { binding: 11, resource: { buffer: groupIdsBuffer } },
        { binding: 12, resource: { buffer: formationSlotsBuffer } },
        { binding: 13, resource: { buffer: hazardAvoidanceBuffer } },
        { binding: 14, resource: { buffer: holdingBuffer } },
      ],
    });
  });
  const zerosCellCount = new Uint32Array(cellCount);
  const zerosBlocks = new Uint32Array(blocks);
  function syncParams() {
    device.queue.writeBuffer(gridParamsBuffer, 0, buildGridParamsData(count, layout));
    const moveData = buildMoveParamsData(count, layout, params, wallCount);
    new DataView(moveData).setFloat32(20, dt, true); // current dt overrides params.dt
    device.queue.writeBuffer(moveParamsBuffer, 0, moveData);
  }
  const allBuffers = [
    ...posBuffers,
    ...velBuffers,
    speedBuffer,
    radiiBuffer,
    targetsBuffer,
    groupIdsBuffer,
    formationSlotsBuffer,
    hazardAvoidanceBuffer,
    holdingBuffer,
    wallsBuffer,
    gridParamsBuffer,
    moveParamsBuffer,
    cellCountsBuffer,
    cellOffsetsBuffer,
    blockTotalsBuffer,
    metaBuffer,
    cellCursorBuffer,
    sortedAgentIdsBuffer,
    positionsReadbackBuffer,
    velocitiesReadbackBuffer,
  ];
  return {
    setCount(next: number) {
      count = Math.max(0, Math.min(next, capacity));
      syncParams();
    },
    uploadSpawns(spawns: AgentSpawn[]) {
      if (spawns.length === 0) {
        return;
      }
      const sorted = [...spawns].sort((a, b) => a.index - b.index);
      let runStart = 0;
      while (runStart < sorted.length) {
        let runEnd = runStart;
        while (
          runEnd + 1 < sorted.length &&
          sorted[runEnd + 1].index === sorted[runEnd].index + 1
        ) {
          runEnd++;
        }
        const len = runEnd - runStart + 1;
        const startIndex = sorted[runStart].index;
        const pos = new Float32Array(len * 2);
        const vel = new Float32Array(len * 2);
        const spd = new Float32Array(len);
        const rad = new Float32Array(len);
        const tgt = new Float32Array(len * 2);
        for (let k = 0; k < len; k++) {
          const spawn = sorted[runStart + k];
          pos[k * 2] = spawn.x;
          pos[k * 2 + 1] = spawn.y;
          spd[k] = spawn.speed;
          rad[k] = spawn.radius;
          tgt[k * 2] = spawn.targetX;
          tgt[k * 2 + 1] = spawn.targetY;
        }
        device.queue.writeBuffer(posBuffers[cur], startIndex * 2 * F32, pos);
        device.queue.writeBuffer(velBuffers[cur], startIndex * 2 * F32, vel);
        device.queue.writeBuffer(speedBuffer, startIndex * F32, spd);
        device.queue.writeBuffer(radiiBuffer, startIndex * F32, rad);
        device.queue.writeBuffer(targetsBuffer, startIndex * 2 * F32, tgt);
        runStart = runEnd + 1;
      }
    },
    uploadGroupIds(groupIds: Int32Array) {
      device.queue.writeBuffer(groupIdsBuffer, 0, groupIds);
    },
    uploadFormationSlots(formationSlots: Float32Array) {
      device.queue.writeBuffer(formationSlotsBuffer, 0, formationSlots);
    },
    uploadHazardAvoidance(hazardAvoidance: Float32Array) {
      device.queue.writeBuffer(hazardAvoidanceBuffer, 0, hazardAvoidance);
    },
    uploadHolding(holding: Uint32Array) {
      device.queue.writeBuffer(holdingBuffer, 0, holding);
    },
    step(nextDt: number) {
      if (count === 0) {
        return;
      }
      if (nextDt !== dt) {
        dt = nextDt;
        device.queue.writeBuffer(moveParamsBuffer, 20, new Float32Array([dt]));
      }
      device.queue.writeBuffer(cellCountsBuffer, 0, zerosCellCount);
      device.queue.writeBuffer(cellCursorBuffer, 0, zerosCellCount);
      device.queue.writeBuffer(blockTotalsBuffer, 0, zerosBlocks);
      const sortGroups = Math.ceil(count / SORT_WORKGROUP);
      const moveGroups = Math.ceil(count / FUSED_MOVE_WORKGROUP);
      const encoder = device.createCommandEncoder({ label: "core-step" });
      const pass = encoder.beginComputePass({ label: "core-step-pass" });
      pass.setPipeline(sort.countPipeline);
      pass.setBindGroup(0, countBindGroups[cur]);
      pass.dispatchWorkgroups(sortGroups);
      pass.setPipeline(sort.scanBlocksPipeline);
      pass.setBindGroup(0, scanBindGroup);
      pass.dispatchWorkgroups(blocks);
      pass.setPipeline(sort.addOffsetsPipeline);
      pass.setBindGroup(0, scanBindGroup);
      pass.dispatchWorkgroups(blocks);
      pass.setPipeline(sort.scatterPipeline);
      pass.setBindGroup(0, scatterBindGroups[cur]);
      pass.dispatchWorkgroups(sortGroups);
      pass.setPipeline(move.pipeline);
      pass.setBindGroup(0, moveBindGroups[cur]);
      pass.dispatchWorkgroups(moveGroups);
      pass.end();
      device.queue.submit([encoder.finish()]); // no readback, no map
      cur = cur ^ 1;
    },
    positionsBuffer() {
      return posBuffers[cur];
    },
    async readAggregates() {
      const encoder = device.createCommandEncoder({ label: "core-aggregates" });
      const readback = enqueueCopyToReadbackBuffer(
        device,
        encoder,
        cellCountsBuffer,
        cellCount,
      );
      device.queue.submit([encoder.finish()]);
      await device.queue.onSubmittedWorkDone();
      const cellCounts = await readUint32Array(readback, cellCount);
      readback.destroy();
      return { cellCounts, maxCount: maxUint32(cellCounts) };
    },
    async readback() {
      if (count === 0) {
        return { positions: new Float32Array(), velocities: new Float32Array() };
      }
      const bytes = count * 2 * F32;
      device.pushErrorScope("validation");
      device.pushErrorScope("internal");
      const encoder = device.createCommandEncoder({ label: "core-readback" });
      encoder.copyBufferToBuffer(posBuffers[cur], 0, positionsReadbackBuffer, 0, bytes);
      encoder.copyBufferToBuffer(
        velBuffers[cur],
        0,
        velocitiesReadbackBuffer,
        0,
        bytes,
      );
      device.queue.submit([encoder.finish()]);
      await device.queue.onSubmittedWorkDone();
      const internalError = await device.popErrorScope();
      const validationError = await device.popErrorScope();
      if (internalError || validationError) {
        throw new Error(
          internalError?.message ?? validationError?.message ?? "GPU readback failed",
        );
      }
      const positions = await readFloat32Array(positionsReadbackBuffer, count * 2);
      const velocities = await readFloat32Array(velocitiesReadbackBuffer, count * 2);
      return { positions, velocities };
    },
    destroy() {
      for (const buffer of allBuffers) {
        buffer.destroy();
      }
    },
  };
}
