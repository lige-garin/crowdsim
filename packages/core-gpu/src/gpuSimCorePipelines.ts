import { readOnlyStorageBinding, storageBinding } from "./gpuUtils";
import {
  countShader,
  fusedMoveShader,
  scanShader,
  scatterShader,
} from "./gpuSimCoreShaders";
import type { SpatialHashGridLayout } from "./types";
import type { GpuSimCoreSocialForceParams } from "./gpuSimCoreSocialForce";
export const U32 = Uint32Array.BYTES_PER_ELEMENT;
export const F32 = Float32Array.BYTES_PER_ELEMENT;
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
export function createSortPipelines(device: GPUDevice): SortPipelines {
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
    entries: [readOnlyStorageBinding(0), readOnlyStorageBinding(1), storageBinding(2)],
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
export function createMovePipeline(device: GPUDevice): {
  layout: GPUBindGroupLayout;
  pipeline: GPUComputePipeline;
} {
  // The fused move binds 13 storage buffers (11 + ADR-0015 stage 2's
  // groupIds/formationSlots) — above the WebGPU default of 8. Without this
  // check the pipeline fails validation *silently* (async device error) and
  // every step() becomes a no-op that still costs submission time, which is
  // exactly how a benchmark measures a dead pipeline.
  const needed = 13;

  if (device.limits.maxStorageBuffersPerShaderStage < needed) {
    throw new Error(
      `fused-move binds ${needed} storage buffers but this device allows ` +
        `${device.limits.maxStorageBuffersPerShaderStage} per stage. Request the ` +
        `adapter limit first: requestDevice({ requiredLimits: { ` +
        `maxStorageBuffersPerShaderStage: ${needed} } }).`,
    );
  }

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
      readOnlyStorageBinding(5), // radii
      readOnlyStorageBinding(6), // cellOffsets
      readOnlyStorageBinding(7), // sortedAgentIds
      readOnlyStorageBinding(8), // walls
      storageBinding(9), // positionsOut
      storageBinding(10), // velocitiesOut
      readOnlyStorageBinding(11), // groupIds
      readOnlyStorageBinding(12), // formationSlots
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
export function buildMoveParamsData(
  count: number,
  layout: SpatialHashGridLayout,
  params: GpuSimCoreSocialForceParams,
  wallCount: number,
): ArrayBuffer {
  const buffer = new ArrayBuffer(68);
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
  view.setFloat32(56, params.anisotropy, true);
  view.setFloat32(60, params.contactStiffness, true);
  view.setFloat32(64, params.interactionRangeMeters, true);
  return buffer;
}
export function buildGridParamsData(
  count: number,
  layout: SpatialHashGridLayout,
): ArrayBuffer {
  const buffer = new ArrayBuffer(20);
  const view = new DataView(buffer);
  view.setUint32(0, count, true);
  view.setUint32(4, layout.columns, true);
  view.setUint32(8, layout.rows, true);
  view.setUint32(12, layout.cellCount, true);
  view.setFloat32(16, layout.cellSize, true);
  return buffer;
}
