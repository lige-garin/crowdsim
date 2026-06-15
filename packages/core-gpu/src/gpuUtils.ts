import type { AgentSoA, FlowField, SpatialHashGridLayout, WallSegment } from "./types";

export function createWallsBufferData(walls: WallSegment[]): Float32Array {
  const wallData = new Float32Array(walls.length * 4);

  walls.forEach((wall, index) => {
    wallData[index * 4] = wall.x1;
    wallData[index * 4 + 1] = wall.y1;
    wallData[index * 4 + 2] = wall.x2;
    wallData[index * 4 + 3] = wall.y2;
  });

  return wallData;
}

export function createGridParams(
  agents: AgentSoA,
  layout: SpatialHashGridLayout,
): ArrayBuffer {
  const params = new ArrayBuffer(20);
  const view = new DataView(params);

  view.setUint32(0, agents.count, true);
  view.setUint32(4, layout.columns, true);
  view.setUint32(8, layout.rows, true);
  view.setUint32(12, layout.cellCount, true);
  view.setFloat32(16, layout.cellSize, true);

  return params;
}

export function createStorageBuffer(
  device: GPUDevice,
  label: string,
  size: number,
  usage: GPUBufferUsageFlags,
): GPUBuffer {
  return device.createBuffer({
    label,
    size,
    usage: GPUBufferUsage.STORAGE | usage,
  });
}

export function createFlowFieldTexture(
  device: GPUDevice,
  flowField: FlowField,
): GPUTexture {
  const bytesPerPixel = 4 * Float32Array.BYTES_PER_ELEMENT;
  const unpaddedBytesPerRow = flowField.layout.columns * bytesPerPixel;
  const bytesPerRow = Math.ceil(unpaddedBytesPerRow / 256) * 256;
  const floatsPerRow = bytesPerRow / Float32Array.BYTES_PER_ELEMENT;
  const textureData = new Float32Array(floatsPerRow * flowField.layout.rows);
  const texture = device.createTexture({
    label: "flow-field-texture",
    size: {
      width: flowField.layout.columns,
      height: flowField.layout.rows,
    },
    format: "rgba32float",
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
  });

  for (let row = 0; row < flowField.layout.rows; row++) {
    for (let column = 0; column < flowField.layout.columns; column++) {
      const cell = row * flowField.layout.columns + column;
      const offset = row * floatsPerRow + column * 4;

      textureData[offset] = flowField.directions[cell * 2];
      textureData[offset + 1] = flowField.directions[cell * 2 + 1];
      textureData[offset + 2] = Number.isFinite(flowField.distances[cell])
        ? flowField.distances[cell]
        : -1;
      textureData[offset + 3] = flowField.blocked[cell];
    }
  }

  device.queue.writeTexture(
    { texture },
    textureData,
    {
      bytesPerRow,
      rowsPerImage: flowField.layout.rows,
    },
    {
      width: flowField.layout.columns,
      height: flowField.layout.rows,
    },
  );

  return texture;
}

export function readOnlyStorageBinding(binding: number): GPUBindGroupLayoutEntry {
  return {
    binding,
    visibility: GPUShaderStage.COMPUTE,
    buffer: { type: "read-only-storage" },
  };
}

export function storageBinding(binding: number): GPUBindGroupLayoutEntry {
  return {
    binding,
    visibility: GPUShaderStage.COMPUTE,
    buffer: { type: "storage" },
  };
}

export function enqueueCopyToReadbackBuffer(
  device: GPUDevice,
  commandEncoder: GPUCommandEncoder,
  source: GPUBuffer,
  length: number,
): GPUBuffer {
  const readbackBuffer = device.createBuffer({
    label: `${source.label}-readback`,
    size: length * Uint32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  commandEncoder.copyBufferToBuffer(
    source,
    0,
    readbackBuffer,
    0,
    length * Uint32Array.BYTES_PER_ELEMENT,
  );

  return readbackBuffer;
}

export async function readUint32Array(
  readbackBuffer: GPUBuffer,
  length: number,
): Promise<Uint32Array> {
  await readbackBuffer.mapAsync(GPUMapMode.READ);
  const result = new Uint32Array(
    readbackBuffer.getMappedRange(0, length * Uint32Array.BYTES_PER_ELEMENT).slice(0),
  );
  readbackBuffer.unmap();
  return result;
}

export async function readFloat32Array(
  readbackBuffer: GPUBuffer,
  length: number,
): Promise<Float32Array> {
  await readbackBuffer.mapAsync(GPUMapMode.READ);
  const result = new Float32Array(
    readbackBuffer.getMappedRange(0, length * Float32Array.BYTES_PER_ELEMENT).slice(0),
  );
  readbackBuffer.unmap();
  return result;
}
