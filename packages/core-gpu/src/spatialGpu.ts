import {
  createGridParams,
  createStorageBuffer,
  enqueueCopyToReadbackBuffer,
  readOnlyStorageBinding,
  readUint32Array,
  storageBinding,
} from "./gpuUtils";
import { maxUint32 } from "./mathUtils";
import { densityAccumulatorShader, spatialHashGridShader } from "./shaders";
import type {
  AgentSoA,
  DensityGridReadback,
  SpatialHashGridLayout,
  SpatialHashGridReadback,
} from "./types";

export async function buildSpatialHashGridGpu(
  device: GPUDevice,
  agents: AgentSoA,
  layout: SpatialHashGridLayout,
): Promise<SpatialHashGridReadback> {
  if (agents.count === 0) {
    return {
      cellIds: new Uint32Array(),
      cellCounts: new Uint32Array(layout.cellCount),
      cellOffsets: new Uint32Array(layout.cellCount + 1),
      sortedAgentIds: new Uint32Array(),
    };
  }

  device.pushErrorScope("validation");
  device.pushErrorScope("internal");

  const positions = agents.positions.slice(0, agents.count * 2);
  const positionsBuffer = createStorageBuffer(
    device,
    "hash-grid-positions",
    positions.byteLength,
    GPUBufferUsage.COPY_DST,
  );
  const cellIdsBuffer = createStorageBuffer(
    device,
    "hash-grid-cell-ids",
    agents.count * Uint32Array.BYTES_PER_ELEMENT,
    GPUBufferUsage.COPY_SRC,
  );
  const cellCountsBuffer = createStorageBuffer(
    device,
    "hash-grid-cell-counts",
    layout.cellCount * Uint32Array.BYTES_PER_ELEMENT,
    GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  );
  const cellOffsetsBuffer = createStorageBuffer(
    device,
    "hash-grid-cell-offsets",
    (layout.cellCount + 1) * Uint32Array.BYTES_PER_ELEMENT,
    GPUBufferUsage.COPY_SRC,
  );
  const sortedAgentIdsBuffer = createStorageBuffer(
    device,
    "hash-grid-sorted-agent-ids",
    agents.count * Uint32Array.BYTES_PER_ELEMENT,
    GPUBufferUsage.COPY_SRC,
  );
  const paramsBuffer = device.createBuffer({
    label: "hash-grid-params",
    size: 20,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  device.queue.writeBuffer(positionsBuffer, 0, positions);
  device.queue.writeBuffer(cellCountsBuffer, 0, new Uint32Array(layout.cellCount));
  device.queue.writeBuffer(paramsBuffer, 0, createGridParams(agents, layout));

  const shaderModule = device.createShaderModule({
    label: "spatial-hash-grid",
    code: spatialHashGridShader,
  });
  const bindGroupLayout = device.createBindGroupLayout({
    label: "hash-grid-bind-group-layout",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" },
      },
      {
        binding: 4,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" },
      },
      {
        binding: 5,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" },
      },
    ],
  });
  const pipelineLayout = device.createPipelineLayout({
    label: "hash-grid-pipeline-layout",
    bindGroupLayouts: [bindGroupLayout],
  });
  const hashPipeline = device.createComputePipeline({
    label: "hash-grid-pass",
    layout: pipelineLayout,
    compute: {
      module: shaderModule,
      entryPoint: "hash_agents",
    },
  });
  const sortPipeline = device.createComputePipeline({
    label: "hash-grid-sort-pass",
    layout: pipelineLayout,
    compute: {
      module: shaderModule,
      entryPoint: "sort_agents",
    },
  });
  const offsetsPipeline = device.createComputePipeline({
    label: "hash-grid-offsets-pass",
    layout: pipelineLayout,
    compute: {
      module: shaderModule,
      entryPoint: "build_offsets",
    },
  });
  const hashBindGroup = device.createBindGroup({
    label: "hash-grid-bind-group",
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: paramsBuffer } },
      { binding: 1, resource: { buffer: positionsBuffer } },
      { binding: 2, resource: { buffer: cellIdsBuffer } },
      { binding: 3, resource: { buffer: cellCountsBuffer } },
      { binding: 4, resource: { buffer: cellOffsetsBuffer } },
      { binding: 5, resource: { buffer: sortedAgentIdsBuffer } },
    ],
  });
  const commandEncoder = device.createCommandEncoder({
    label: "hash-grid-command-encoder",
  });
  const pass = commandEncoder.beginComputePass({
    label: "hash-grid-compute-pass",
  });

  pass.setPipeline(hashPipeline);
  pass.setBindGroup(0, hashBindGroup);
  pass.dispatchWorkgroups(Math.ceil(agents.count / 64));

  pass.setPipeline(sortPipeline);
  pass.setBindGroup(0, hashBindGroup);
  pass.dispatchWorkgroups(Math.ceil(agents.count / 64));

  pass.setPipeline(offsetsPipeline);
  pass.setBindGroup(0, hashBindGroup);
  pass.dispatchWorkgroups(Math.ceil((layout.cellCount + 1) / 64));
  pass.end();

  const cellIdsReadback = enqueueCopyToReadbackBuffer(
    device,
    commandEncoder,
    cellIdsBuffer,
    agents.count,
  );
  const cellCountsReadback = enqueueCopyToReadbackBuffer(
    device,
    commandEncoder,
    cellCountsBuffer,
    layout.cellCount,
  );
  const cellOffsetsReadback = enqueueCopyToReadbackBuffer(
    device,
    commandEncoder,
    cellOffsetsBuffer,
    layout.cellCount + 1,
  );
  const sortedAgentIdsReadback = enqueueCopyToReadbackBuffer(
    device,
    commandEncoder,
    sortedAgentIdsBuffer,
    agents.count,
  );

  device.queue.submit([commandEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();

  const internalError = await device.popErrorScope();
  const validationError = await device.popErrorScope();

  if (internalError || validationError) {
    throw new Error(
      internalError?.message ??
        validationError?.message ??
        "GPU spatial hash command failed",
    );
  }

  const result = {
    cellIds: await readUint32Array(cellIdsReadback, agents.count),
    cellCounts: await readUint32Array(cellCountsReadback, layout.cellCount),
    cellOffsets: await readUint32Array(cellOffsetsReadback, layout.cellCount + 1),
    sortedAgentIds: await readUint32Array(sortedAgentIdsReadback, agents.count),
  };

  positionsBuffer.destroy();
  cellIdsBuffer.destroy();
  cellCountsBuffer.destroy();
  cellOffsetsBuffer.destroy();
  sortedAgentIdsBuffer.destroy();
  cellIdsReadback.destroy();
  cellCountsReadback.destroy();
  cellOffsetsReadback.destroy();
  sortedAgentIdsReadback.destroy();
  paramsBuffer.destroy();

  return result;
}

export async function accumulateDensityGpu(
  device: GPUDevice,
  agents: AgentSoA,
  layout: SpatialHashGridLayout,
): Promise<DensityGridReadback> {
  if (agents.count === 0) {
    return {
      cellCounts: new Uint32Array(layout.cellCount),
      maxCount: 0,
    };
  }

  device.pushErrorScope("validation");
  device.pushErrorScope("internal");

  const positions = agents.positions.slice(0, agents.count * 2);
  const positionsBuffer = createStorageBuffer(
    device,
    "density-positions",
    positions.byteLength,
    GPUBufferUsage.COPY_DST,
  );
  const cellCountsBuffer = createStorageBuffer(
    device,
    "density-cell-counts",
    layout.cellCount * Uint32Array.BYTES_PER_ELEMENT,
    GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  );
  const paramsBuffer = device.createBuffer({
    label: "density-params",
    size: 20,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  device.queue.writeBuffer(positionsBuffer, 0, positions);
  device.queue.writeBuffer(cellCountsBuffer, 0, new Uint32Array(layout.cellCount));
  device.queue.writeBuffer(paramsBuffer, 0, createGridParams(agents, layout));

  const shaderModule = device.createShaderModule({
    label: "density-accumulator-shader",
    code: densityAccumulatorShader,
  });
  const bindGroupLayout = device.createBindGroupLayout({
    label: "density-bind-group-layout",
    entries: [readOnlyStorageBinding(0), readOnlyStorageBinding(1), storageBinding(2)],
  });
  const pipelineLayout = device.createPipelineLayout({
    label: "density-pipeline-layout",
    bindGroupLayouts: [bindGroupLayout],
  });
  const pipeline = device.createComputePipeline({
    label: "density-accumulator-pipeline",
    layout: pipelineLayout,
    compute: {
      module: shaderModule,
      entryPoint: "accumulate_density",
    },
  });
  const bindGroup = device.createBindGroup({
    label: "density-bind-group",
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: paramsBuffer } },
      { binding: 1, resource: { buffer: positionsBuffer } },
      { binding: 2, resource: { buffer: cellCountsBuffer } },
    ],
  });
  const commandEncoder = device.createCommandEncoder({
    label: "density-command-encoder",
  });
  const pass = commandEncoder.beginComputePass({
    label: "density-compute-pass",
  });

  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(agents.count / 64));
  pass.end();

  const cellCountsReadback = enqueueCopyToReadbackBuffer(
    device,
    commandEncoder,
    cellCountsBuffer,
    layout.cellCount,
  );

  device.queue.submit([commandEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();

  const internalError = await device.popErrorScope();
  const validationError = await device.popErrorScope();

  if (internalError || validationError) {
    throw new Error(
      internalError?.message ??
        validationError?.message ??
        "GPU density accumulation failed",
    );
  }

  const cellCounts = await readUint32Array(cellCountsReadback, layout.cellCount);

  positionsBuffer.destroy();
  cellCountsBuffer.destroy();
  paramsBuffer.destroy();
  cellCountsReadback.destroy();

  return {
    cellCounts,
    maxCount: maxUint32(cellCounts),
  };
}
