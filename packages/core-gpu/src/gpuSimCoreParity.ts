import {
  createGridParams,
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
import type { AgentSoA, SpatialHashGridLayout, WallSegment } from "./types";
import type { GpuSimCoreSocialForceParams } from "./gpuSimCoreSocialForce";
import {
  F32,
  U32,
  buildMoveParamsData,
  createMovePipeline,
  createSortPipelines,
} from "./gpuSimCorePipelines";
export type SortParityReadback = {
  cellOffsets: Uint32Array;
  sortedAgentIds: Uint32Array;
};
export type StepParityReadback = {
  positions: Float32Array;
  velocities: Float32Array;
};
export async function sortAgentsForParity(
  device: GPUDevice,
  agents: AgentSoA,
  layout: SpatialHashGridLayout,
): Promise<SortParityReadback> {
  if (agents.count === 0) {
    return {
      cellOffsets: new Uint32Array(layout.cellCount + 1),
      sortedAgentIds: new Uint32Array(),
    };
  }
  device.pushErrorScope("validation");
  device.pushErrorScope("internal");
  const count = agents.count;
  const cellCount = layout.cellCount;
  const blocks = Math.max(1, Math.ceil(cellCount / SCAN_WORKGROUP));
  const positions = agents.positions.slice(0, count * 2);
  const paramsBuffer = device.createBuffer({
    label: "sort-params",
    size: 20,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const positionsBuffer = createStorageBuffer(
    device,
    "sort-positions",
    positions.byteLength,
    GPUBufferUsage.COPY_DST,
  );
  const cellCountsBuffer = createStorageBuffer(
    device,
    "sort-cell-counts",
    cellCount * U32,
    GPUBufferUsage.COPY_DST,
  );
  const cellOffsetsBuffer = createStorageBuffer(
    device,
    "sort-cell-offsets",
    (cellCount + 1) * U32,
    GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  );
  const blockTotalsBuffer = createStorageBuffer(
    device,
    "sort-block-totals",
    blocks * U32,
    GPUBufferUsage.COPY_DST,
  );
  const metaBuffer = createStorageBuffer(
    device,
    "sort-meta",
    U32,
    GPUBufferUsage.COPY_DST,
  );
  const cellCursorBuffer = createStorageBuffer(
    device,
    "sort-cell-cursor",
    cellCount * U32,
    GPUBufferUsage.COPY_DST,
  );
  const sortedAgentIdsBuffer = createStorageBuffer(
    device,
    "sort-sorted-agent-ids",
    count * U32,
    GPUBufferUsage.COPY_SRC,
  );
  device.queue.writeBuffer(paramsBuffer, 0, createGridParams(agents, layout));
  device.queue.writeBuffer(positionsBuffer, 0, positions);
  device.queue.writeBuffer(cellCountsBuffer, 0, new Uint32Array(cellCount));
  device.queue.writeBuffer(cellOffsetsBuffer, 0, new Uint32Array(cellCount + 1));
  device.queue.writeBuffer(blockTotalsBuffer, 0, new Uint32Array(blocks));
  device.queue.writeBuffer(metaBuffer, 0, new Uint32Array([cellCount]));
  device.queue.writeBuffer(cellCursorBuffer, 0, new Uint32Array(cellCount));
  const sort = createSortPipelines(device);
  const countBindGroup = device.createBindGroup({
    label: "sort-count-bg",
    layout: sort.countLayout,
    entries: [
      { binding: 0, resource: { buffer: paramsBuffer } },
      { binding: 1, resource: { buffer: positionsBuffer } },
      { binding: 2, resource: { buffer: cellCountsBuffer } },
    ],
  });
  const scanBindGroup = device.createBindGroup({
    label: "sort-scan-bg",
    layout: sort.scanLayout,
    entries: [
      { binding: 0, resource: { buffer: cellCountsBuffer } },
      { binding: 1, resource: { buffer: cellOffsetsBuffer } },
      { binding: 2, resource: { buffer: blockTotalsBuffer } },
      { binding: 3, resource: { buffer: metaBuffer } },
    ],
  });
  const scatterBindGroup = device.createBindGroup({
    label: "sort-scatter-bg",
    layout: sort.scatterLayout,
    entries: [
      { binding: 0, resource: { buffer: paramsBuffer } },
      { binding: 1, resource: { buffer: positionsBuffer } },
      { binding: 2, resource: { buffer: cellOffsetsBuffer } },
      { binding: 3, resource: { buffer: cellCursorBuffer } },
      { binding: 4, resource: { buffer: sortedAgentIdsBuffer } },
    ],
  });
  const encoder = device.createCommandEncoder({ label: "sort-encoder" });
  const pass = encoder.beginComputePass({ label: "sort-pass" });
  pass.setPipeline(sort.countPipeline);
  pass.setBindGroup(0, countBindGroup);
  pass.dispatchWorkgroups(Math.ceil(count / SORT_WORKGROUP));
  pass.setPipeline(sort.scanBlocksPipeline);
  pass.setBindGroup(0, scanBindGroup);
  pass.dispatchWorkgroups(blocks);
  pass.setPipeline(sort.addOffsetsPipeline);
  pass.setBindGroup(0, scanBindGroup);
  pass.dispatchWorkgroups(blocks);
  pass.setPipeline(sort.scatterPipeline);
  pass.setBindGroup(0, scatterBindGroup);
  pass.dispatchWorkgroups(Math.ceil(count / SORT_WORKGROUP));
  pass.end();
  const cellOffsetsReadback = enqueueCopyToReadbackBuffer(
    device,
    encoder,
    cellOffsetsBuffer,
    cellCount + 1,
  );
  const sortedAgentIdsReadback = enqueueCopyToReadbackBuffer(
    device,
    encoder,
    sortedAgentIdsBuffer,
    count,
  );
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  const internalError = await device.popErrorScope();
  const validationError = await device.popErrorScope();
  if (internalError || validationError) {
    throw new Error(
      internalError?.message ?? validationError?.message ?? "GPU counting sort failed",
    );
  }
  const result: SortParityReadback = {
    cellOffsets: await readUint32Array(cellOffsetsReadback, cellCount + 1),
    sortedAgentIds: await readUint32Array(sortedAgentIdsReadback, count),
  };
  paramsBuffer.destroy();
  positionsBuffer.destroy();
  cellCountsBuffer.destroy();
  cellOffsetsBuffer.destroy();
  blockTotalsBuffer.destroy();
  metaBuffer.destroy();
  cellCursorBuffer.destroy();
  sortedAgentIdsBuffer.destroy();
  cellOffsetsReadback.destroy();
  sortedAgentIdsReadback.destroy();
  return result;
}
export async function stepForParity(
  device: GPUDevice,
  agents: AgentSoA,
  targetPositions: Float32Array,
  walls: WallSegment[],
  params: GpuSimCoreSocialForceParams,
  layout: SpatialHashGridLayout,
  steps: number,
): Promise<StepParityReadback> {
  const count = agents.count;
  if (count === 0) {
    return { positions: new Float32Array(), velocities: new Float32Array() };
  }
  if (params.interactionRangeMeters > layout.cellSize) {
    throw new Error(
      "interactionRangeMeters must be <= cellSize for the 3x3 neighborhood to be exact",
    );
  }
  device.pushErrorScope("validation");
  device.pushErrorScope("internal");
  const cellCount = layout.cellCount;
  const blocks = Math.max(1, Math.ceil(cellCount / SCAN_WORKGROUP));
  const wallCount = walls.length;
  const posBytes = count * 2 * F32;
  const posBuffers = [0, 1].map((i) =>
    createStorageBuffer(
      device,
      `step-positions-${i}`,
      posBytes,
      GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    ),
  );
  const velBuffers = [0, 1].map((i) =>
    createStorageBuffer(
      device,
      `step-velocities-${i}`,
      posBytes,
      GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    ),
  );
  const speedBuffer = createStorageBuffer(
    device,
    "step-speed",
    count * F32,
    GPUBufferUsage.COPY_DST,
  );
  const radiiBuffer = createStorageBuffer(
    device,
    "step-radii",
    count * F32,
    GPUBufferUsage.COPY_DST,
  );
  const targetsBuffer = createStorageBuffer(
    device,
    "step-targets",
    count * 2 * F32,
    GPUBufferUsage.COPY_DST,
  );
  const wallsBuffer = createStorageBuffer(
    device,
    "step-walls",
    Math.max(1, wallCount) * 4 * F32,
    GPUBufferUsage.COPY_DST,
  );
  const gridParamsBuffer = device.createBuffer({
    label: "step-grid-params",
    size: 20,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const moveParamsBuffer = device.createBuffer({
    label: "step-move-params",
    size: 68,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const cellCountsBuffer = createStorageBuffer(
    device,
    "step-cell-counts",
    cellCount * U32,
    GPUBufferUsage.COPY_DST,
  );
  const cellOffsetsBuffer = createStorageBuffer(
    device,
    "step-cell-offsets",
    (cellCount + 1) * U32,
    GPUBufferUsage.COPY_DST,
  );
  const blockTotalsBuffer = createStorageBuffer(
    device,
    "step-block-totals",
    blocks * U32,
    GPUBufferUsage.COPY_DST,
  );
  const metaBuffer = createStorageBuffer(
    device,
    "step-meta",
    U32,
    GPUBufferUsage.COPY_DST,
  );
  const cellCursorBuffer = createStorageBuffer(
    device,
    "step-cell-cursor",
    cellCount * U32,
    GPUBufferUsage.COPY_DST,
  );
  const sortedAgentIdsBuffer = createStorageBuffer(
    device,
    "step-sorted-agent-ids",
    count * U32,
    GPUBufferUsage.STORAGE,
  );
  device.queue.writeBuffer(posBuffers[0], 0, agents.positions.slice(0, count * 2));
  device.queue.writeBuffer(velBuffers[0], 0, agents.velocities.slice(0, count * 2));
  device.queue.writeBuffer(speedBuffer, 0, agents.speed.slice(0, count));
  device.queue.writeBuffer(radiiBuffer, 0, agents.radius.slice(0, count));
  device.queue.writeBuffer(targetsBuffer, 0, targetPositions.slice(0, count * 2));
  if (wallCount > 0) {
    device.queue.writeBuffer(wallsBuffer, 0, createWallsBufferData(walls));
  }
  device.queue.writeBuffer(gridParamsBuffer, 0, createGridParams(agents, layout));
  device.queue.writeBuffer(
    moveParamsBuffer,
    0,
    buildMoveParamsData(count, layout, params, wallCount),
  );
  device.queue.writeBuffer(metaBuffer, 0, new Uint32Array([cellCount]));
  const sort = createSortPipelines(device);
  const move = createMovePipeline(device);
  const scanBindGroup = device.createBindGroup({
    label: "step-scan-bg",
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
      label: `step-count-bg-${side}`,
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
      label: `step-scatter-bg-${side}`,
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
      label: `step-move-bg-${side}`,
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
      ],
    });
  });
  const sortGroups = Math.ceil(count / SORT_WORKGROUP);
  const moveGroups = Math.ceil(count / FUSED_MOVE_WORKGROUP);
  const zerosCellCount = new Uint32Array(cellCount);
  const zerosBlocks = new Uint32Array(blocks);
  let cur = 0;
  for (let step = 0; step < steps; step++) {
    device.queue.writeBuffer(cellCountsBuffer, 0, zerosCellCount);
    device.queue.writeBuffer(cellCursorBuffer, 0, zerosCellCount);
    device.queue.writeBuffer(blockTotalsBuffer, 0, zerosBlocks);
    const encoder = device.createCommandEncoder({ label: `step-encoder-${step}` });
    const pass = encoder.beginComputePass({ label: `step-pass-${step}` });
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
    device.queue.submit([encoder.finish()]);
    cur = cur ^ 1;
  }
  const readbackEncoder = device.createCommandEncoder({ label: "step-readback" });
  const positionsReadback = enqueueCopyToReadbackBuffer(
    device,
    readbackEncoder,
    posBuffers[cur],
    count * 2,
  );
  const velocitiesReadback = enqueueCopyToReadbackBuffer(
    device,
    readbackEncoder,
    velBuffers[cur],
    count * 2,
  );
  device.queue.submit([readbackEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  const internalError = await device.popErrorScope();
  const validationError = await device.popErrorScope();
  if (internalError || validationError) {
    throw new Error(
      internalError?.message ?? validationError?.message ?? "GPU fused step failed",
    );
  }
  const result: StepParityReadback = {
    positions: await readFloat32Array(positionsReadback, count * 2),
    velocities: await readFloat32Array(velocitiesReadback, count * 2),
  };
  for (const buffer of [
    ...posBuffers,
    ...velBuffers,
    speedBuffer,
    radiiBuffer,
    targetsBuffer,
    wallsBuffer,
    gridParamsBuffer,
    moveParamsBuffer,
    cellCountsBuffer,
    cellOffsetsBuffer,
    blockTotalsBuffer,
    metaBuffer,
    cellCursorBuffer,
    sortedAgentIdsBuffer,
    positionsReadback,
    velocitiesReadback,
  ]) {
    buffer.destroy();
  }
  return result;
}
