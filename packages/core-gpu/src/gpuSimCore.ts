// SP-1 GPU-resident core. STATUS: authored against the CPU-oracle contract but
// NOT yet verified on a real WebGPU device (this sandbox has no adapter). The
// test-webgpu/*.webgpu.ts parity specs are the correctness gate; run them via
// `pnpm test:webgpu` on real hardware and iterate the shaders/buffers there.
import {
  createGridParams,
  createStorageBuffer,
  createWallsBufferData,
  enqueueCopyToReadbackBuffer,
  readFloat32Array,
  readOnlyStorageBinding,
  readUint32Array,
  storageBinding,
} from "./gpuUtils";
import {
  FUSED_MOVE_WORKGROUP,
  SCAN_WORKGROUP,
  SORT_WORKGROUP,
  countShader,
  fusedMoveShader,
  scanShader,
  scatterShader,
} from "./gpuSimCoreShaders";
import type {
  AgentSoA,
  SocialForceParams,
  SpatialHashGridLayout,
  WallSegment,
} from "./types";

const U32 = Uint32Array.BYTES_PER_ELEMENT;
const F32 = Float32Array.BYTES_PER_ELEMENT;

export type SortParityReadback = {
  cellOffsets: Uint32Array;
  sortedAgentIds: Uint32Array;
};

export type StepParityReadback = {
  positions: Float32Array;
  velocities: Float32Array;
};

type SortPipelines = {
  countLayout: GPUBindGroupLayout;
  scanLayout: GPUBindGroupLayout;
  scatterLayout: GPUBindGroupLayout;
  countPipeline: GPUComputePipeline;
  scanBlocksPipeline: GPUComputePipeline;
  addOffsetsPipeline: GPUComputePipeline;
  scatterPipeline: GPUComputePipeline;
};

function createSortPipelines(device: GPUDevice): SortPipelines {
  const countModule = device.createShaderModule({
    label: "sort-count",
    code: countShader,
  });
  const scanModule = device.createShaderModule({
    label: "sort-scan",
    code: scanShader,
  });
  const scatterModule = device.createShaderModule({
    label: "sort-scatter",
    code: scatterShader,
  });
  const countLayout = device.createBindGroupLayout({
    label: "sort-count-bgl",
    entries: [
      readOnlyStorageBinding(0),
      readOnlyStorageBinding(1),
      storageBinding(2),
    ],
  });
  const scanLayout = device.createBindGroupLayout({
    label: "sort-scan-bgl",
    entries: [
      readOnlyStorageBinding(0),
      storageBinding(1),
      storageBinding(2),
      readOnlyStorageBinding(3),
    ],
  });
  const scatterLayout = device.createBindGroupLayout({
    label: "sort-scatter-bgl",
    entries: [
      readOnlyStorageBinding(0),
      readOnlyStorageBinding(1),
      readOnlyStorageBinding(2),
      storageBinding(3),
      storageBinding(4),
    ],
  });

  return {
    countLayout,
    scanLayout,
    scatterLayout,
    countPipeline: device.createComputePipeline({
      label: "sort-count-pipeline",
      layout: device.createPipelineLayout({ bindGroupLayouts: [countLayout] }),
      compute: { module: countModule, entryPoint: "count" },
    }),
    scanBlocksPipeline: device.createComputePipeline({
      label: "sort-scan-blocks-pipeline",
      layout: device.createPipelineLayout({ bindGroupLayouts: [scanLayout] }),
      compute: { module: scanModule, entryPoint: "scan_blocks" },
    }),
    addOffsetsPipeline: device.createComputePipeline({
      label: "sort-add-offsets-pipeline",
      layout: device.createPipelineLayout({ bindGroupLayouts: [scanLayout] }),
      compute: { module: scanModule, entryPoint: "add_block_offsets" },
    }),
    scatterPipeline: device.createComputePipeline({
      label: "sort-scatter-pipeline",
      layout: device.createPipelineLayout({ bindGroupLayouts: [scatterLayout] }),
      compute: { module: scatterModule, entryPoint: "scatter" },
    }),
  };
}

function createMovePipeline(device: GPUDevice): {
  layout: GPUBindGroupLayout;
  pipeline: GPUComputePipeline;
} {
  const module = device.createShaderModule({
    label: "fused-move",
    code: fusedMoveShader,
  });
  const layout = device.createBindGroupLayout({
    label: "fused-move-bgl",
    entries: [
      readOnlyStorageBinding(0), // params
      readOnlyStorageBinding(1), // positionsIn
      readOnlyStorageBinding(2), // velocitiesIn
      readOnlyStorageBinding(3), // targets
      readOnlyStorageBinding(4), // speed
      readOnlyStorageBinding(5), // cellOffsets
      readOnlyStorageBinding(6), // sortedAgentIds
      readOnlyStorageBinding(7), // walls
      storageBinding(8), // positionsOut
      storageBinding(9), // velocitiesOut
    ],
  });

  return {
    layout,
    pipeline: device.createComputePipeline({
      label: "fused-move-pipeline",
      layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      compute: { module, entryPoint: "fused_move" },
    }),
  };
}

// 56-byte MoveParams struct (gpuSimCoreShaders.ts), all 4-byte scalars.
function buildMoveParamsData(
  count: number,
  layout: SpatialHashGridLayout,
  params: SocialForceParams,
  wallCount: number,
): ArrayBuffer {
  const buffer = new ArrayBuffer(56);
  const view = new DataView(buffer);
  view.setUint32(0, count, true);
  view.setUint32(4, layout.columns, true);
  view.setUint32(8, layout.rows, true);
  view.setUint32(12, layout.cellCount, true);
  view.setFloat32(16, layout.cellSize, true);
  view.setFloat32(20, params.dt, true);
  view.setFloat32(24, params.desiredSpeed, true);
  view.setFloat32(28, params.relaxationTime, true);
  view.setFloat32(32, params.agentRepulsionStrength, true);
  view.setFloat32(36, params.agentRepulsionRange, true);
  view.setFloat32(40, params.wallRepulsionStrength, true);
  view.setFloat32(44, params.wallRepulsionRange, true);
  view.setFloat32(48, params.maxSpeed, true);
  view.setUint32(52, wallCount, true);
  return buffer;
}

// Test-only: runs the O(n) counting sort (count -> exclusive scan -> scatter) and
// reads back cellOffsets + sortedAgentIds for comparison against
// buildSpatialHashGridCpu / exclusiveScanCpu.
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
      internalError?.message ??
        validationError?.message ??
        "GPU counting sort failed",
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

// Test-only: runs `steps` fused GPU steps (sort + fused move, ping-pong) and reads
// back the final positions/velocities for comparison against repeated
// stepSocialForceCpu. Requires agentRepulsionRange <= cellSize so the sorted 3x3
// neighborhood captures every in-range agent (parity contract).
export async function stepForParity(
  device: GPUDevice,
  agents: AgentSoA,
  targetPositions: Float32Array,
  walls: WallSegment[],
  params: SocialForceParams,
  layout: SpatialHashGridLayout,
  steps: number,
): Promise<StepParityReadback> {
  const count = agents.count;
  if (count === 0) {
    return { positions: new Float32Array(), velocities: new Float32Array() };
  }
  if (params.agentRepulsionRange > layout.cellSize) {
    throw new Error(
      "agentRepulsionRange must be <= cellSize for the 3x3 neighborhood to be exact",
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
    size: 56,
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
  // Per ping-pong side: sort reads positions[side]; move reads side, writes other.
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
        { binding: 5, resource: { buffer: cellOffsetsBuffer } },
        { binding: 6, resource: { buffer: sortedAgentIdsBuffer } },
        { binding: 7, resource: { buffer: wallsBuffer } },
        { binding: 8, resource: { buffer: posBuffers[other] } },
        { binding: 9, resource: { buffer: velBuffers[other] } },
      ],
    });
  });

  const sortGroups = Math.ceil(count / SORT_WORKGROUP);
  const moveGroups = Math.ceil(count / FUSED_MOVE_WORKGROUP);
  const zerosCellCount = new Uint32Array(cellCount);
  const zerosBlocks = new Uint32Array(blocks);

  let cur = 0;
  for (let step = 0; step < steps; step++) {
    // counting-sort accumulators must start at zero each step.
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
      internalError?.message ??
        validationError?.message ??
        "GPU fused step failed",
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
