// SP-1 GPU-resident core. STATUS: authored against the CPU-oracle contract but
// NOT yet verified on a real WebGPU device (this sandbox has no adapter). The
// test-webgpu/*.webgpu.ts parity specs are the correctness gate; run them via
// `pnpm test:webgpu` on real hardware and iterate the shaders/buffers there.
import {
  createGridParams,
  createStorageBuffer,
  enqueueCopyToReadbackBuffer,
  readOnlyStorageBinding,
  readUint32Array,
  storageBinding,
} from "./gpuUtils";
import {
  SCAN_WORKGROUP,
  SORT_WORKGROUP,
  countShader,
  scanShader,
  scatterShader,
} from "./gpuSimCoreShaders";
import type { AgentSoA, SpatialHashGridLayout } from "./types";

const U32 = Uint32Array.BYTES_PER_ELEMENT;

export type SortParityReadback = {
  cellOffsets: Uint32Array;
  sortedAgentIds: Uint32Array;
};

// Test-only: runs the O(n) counting sort (count -> exclusive scan -> scatter) and
// reads back cellOffsets + sortedAgentIds for comparison against
// buildSpatialHashGridCpu / exclusiveScanCpu. Allocates per call (not the
// persistent-core path; that is createGpuSimCore in T4).
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

  const countPipeline = device.createComputePipeline({
    label: "sort-count-pipeline",
    layout: device.createPipelineLayout({ bindGroupLayouts: [countLayout] }),
    compute: { module: countModule, entryPoint: "count" },
  });
  const scanBlocksPipeline = device.createComputePipeline({
    label: "sort-scan-blocks-pipeline",
    layout: device.createPipelineLayout({ bindGroupLayouts: [scanLayout] }),
    compute: { module: scanModule, entryPoint: "scan_blocks" },
  });
  const addOffsetsPipeline = device.createComputePipeline({
    label: "sort-add-offsets-pipeline",
    layout: device.createPipelineLayout({ bindGroupLayouts: [scanLayout] }),
    compute: { module: scanModule, entryPoint: "add_block_offsets" },
  });
  const scatterPipeline = device.createComputePipeline({
    label: "sort-scatter-pipeline",
    layout: device.createPipelineLayout({ bindGroupLayouts: [scatterLayout] }),
    compute: { module: scatterModule, entryPoint: "scatter" },
  });

  const countBindGroup = device.createBindGroup({
    label: "sort-count-bg",
    layout: countLayout,
    entries: [
      { binding: 0, resource: { buffer: paramsBuffer } },
      { binding: 1, resource: { buffer: positionsBuffer } },
      { binding: 2, resource: { buffer: cellCountsBuffer } },
    ],
  });
  const scanBindGroup = device.createBindGroup({
    label: "sort-scan-bg",
    layout: scanLayout,
    entries: [
      { binding: 0, resource: { buffer: cellCountsBuffer } },
      { binding: 1, resource: { buffer: cellOffsetsBuffer } },
      { binding: 2, resource: { buffer: blockTotalsBuffer } },
      { binding: 3, resource: { buffer: metaBuffer } },
    ],
  });
  const scatterBindGroup = device.createBindGroup({
    label: "sort-scatter-bg",
    layout: scatterLayout,
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
  pass.setPipeline(countPipeline);
  pass.setBindGroup(0, countBindGroup);
  pass.dispatchWorkgroups(Math.ceil(count / SORT_WORKGROUP));
  pass.setPipeline(scanBlocksPipeline);
  pass.setBindGroup(0, scanBindGroup);
  pass.dispatchWorkgroups(blocks);
  pass.setPipeline(addOffsetsPipeline);
  pass.setBindGroup(0, scanBindGroup);
  pass.dispatchWorkgroups(blocks);
  pass.setPipeline(scatterPipeline);
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
