import {
  createFlowFieldTexture,
  createStorageBuffer,
  createWallsBufferData,
  enqueueCopyToReadbackBuffer,
  readFloat32Array,
  readOnlyStorageBinding,
  storageBinding,
} from "./gpuUtils";
import { validateSocialForceInputs } from "./mathUtils";
import { flowFieldSamplerShader, socialForceShader } from "./shaders";
import type {
  AgentSoA,
  FlowField,
  SocialForceParams,
  SocialForceStepResult,
  WallSegment,
} from "./types";

export async function stepSocialForceGpu(
  device: GPUDevice,
  agents: AgentSoA,
  targetPositions: Float32Array,
  walls: WallSegment[],
  params: SocialForceParams,
): Promise<SocialForceStepResult> {
  validateSocialForceInputs(agents, targetPositions, params);

  if (agents.count === 0) {
    return {
      positions: new Float32Array(),
      velocities: new Float32Array(),
    };
  }

  device.pushErrorScope("validation");
  device.pushErrorScope("internal");

  const byteLength = agents.count * 2 * Float32Array.BYTES_PER_ELEMENT;
  const positionsIn = agents.positions.slice(0, agents.count * 2);
  const velocitiesIn = agents.velocities.slice(0, agents.count * 2);
  const wallsData = createWallsBufferData(walls);
  const paramsU32 = new Uint32Array([agents.count, walls.length]);
  const paramsF32 = new Float32Array([
    params.dt,
    params.desiredSpeed,
    params.relaxationTime,
    params.agentRepulsionStrength,
    params.agentRepulsionRange,
    params.wallRepulsionStrength,
    params.wallRepulsionRange,
    params.maxSpeed,
  ]);
  const paramsU32Buffer = createStorageBuffer(
    device,
    "social-force-params-u32",
    paramsU32.byteLength,
    GPUBufferUsage.COPY_DST,
  );
  const paramsF32Buffer = createStorageBuffer(
    device,
    "social-force-params-f32",
    paramsF32.byteLength,
    GPUBufferUsage.COPY_DST,
  );
  const positionsInBuffer = createStorageBuffer(
    device,
    "social-force-positions-in",
    byteLength,
    GPUBufferUsage.COPY_DST,
  );
  const velocitiesInBuffer = createStorageBuffer(
    device,
    "social-force-velocities-in",
    byteLength,
    GPUBufferUsage.COPY_DST,
  );
  const targetsBuffer = createStorageBuffer(
    device,
    "social-force-targets",
    byteLength,
    GPUBufferUsage.COPY_DST,
  );
  const wallsBuffer = createStorageBuffer(
    device,
    "social-force-walls",
    Math.max(wallsData.byteLength, 4 * Float32Array.BYTES_PER_ELEMENT),
    GPUBufferUsage.COPY_DST,
  );
  const positionsOutBuffer = createStorageBuffer(
    device,
    "social-force-positions-out",
    byteLength,
    GPUBufferUsage.COPY_SRC,
  );
  const velocitiesOutBuffer = createStorageBuffer(
    device,
    "social-force-velocities-out",
    byteLength,
    GPUBufferUsage.COPY_SRC,
  );

  device.queue.writeBuffer(paramsU32Buffer, 0, paramsU32);
  device.queue.writeBuffer(paramsF32Buffer, 0, paramsF32);
  device.queue.writeBuffer(positionsInBuffer, 0, positionsIn);
  device.queue.writeBuffer(velocitiesInBuffer, 0, velocitiesIn);
  device.queue.writeBuffer(targetsBuffer, 0, targetPositions);

  if (wallsData.byteLength > 0) {
    device.queue.writeBuffer(wallsBuffer, 0, wallsData);
  }

  const bindGroupLayout = device.createBindGroupLayout({
    label: "social-force-bind-group-layout",
    entries: [
      readOnlyStorageBinding(0),
      readOnlyStorageBinding(1),
      readOnlyStorageBinding(2),
      readOnlyStorageBinding(3),
      readOnlyStorageBinding(4),
      readOnlyStorageBinding(5),
      storageBinding(6),
      storageBinding(7),
    ],
  });
  const pipelineLayout = device.createPipelineLayout({
    label: "social-force-pipeline-layout",
    bindGroupLayouts: [bindGroupLayout],
  });
  const shaderModule = device.createShaderModule({
    label: "social-force-shader",
    code: socialForceShader,
  });
  const pipeline = device.createComputePipeline({
    label: "social-force-pipeline",
    layout: pipelineLayout,
    compute: {
      module: shaderModule,
      entryPoint: "step_social_force",
    },
  });
  const bindGroup = device.createBindGroup({
    label: "social-force-bind-group",
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: paramsU32Buffer } },
      { binding: 1, resource: { buffer: paramsF32Buffer } },
      { binding: 2, resource: { buffer: positionsInBuffer } },
      { binding: 3, resource: { buffer: velocitiesInBuffer } },
      { binding: 4, resource: { buffer: targetsBuffer } },
      { binding: 5, resource: { buffer: wallsBuffer } },
      { binding: 6, resource: { buffer: positionsOutBuffer } },
      { binding: 7, resource: { buffer: velocitiesOutBuffer } },
    ],
  });
  const commandEncoder = device.createCommandEncoder({
    label: "social-force-command-encoder",
  });
  const pass = commandEncoder.beginComputePass({
    label: "social-force-compute-pass",
  });

  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(agents.count / 64));
  pass.end();

  const positionsReadback = enqueueCopyToReadbackBuffer(
    device,
    commandEncoder,
    positionsOutBuffer,
    agents.count * 2,
  );
  const velocitiesReadback = enqueueCopyToReadbackBuffer(
    device,
    commandEncoder,
    velocitiesOutBuffer,
    agents.count * 2,
  );

  device.queue.submit([commandEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();

  const internalError = await device.popErrorScope();
  const validationError = await device.popErrorScope();

  if (internalError || validationError) {
    throw new Error(
      internalError?.message ??
        validationError?.message ??
        "GPU social force command failed",
    );
  }

  const result = {
    positions: await readFloat32Array(positionsReadback, agents.count * 2),
    velocities: await readFloat32Array(velocitiesReadback, agents.count * 2),
  };

  paramsU32Buffer.destroy();
  paramsF32Buffer.destroy();
  positionsInBuffer.destroy();
  velocitiesInBuffer.destroy();
  targetsBuffer.destroy();
  wallsBuffer.destroy();
  positionsOutBuffer.destroy();
  velocitiesOutBuffer.destroy();
  positionsReadback.destroy();
  velocitiesReadback.destroy();

  return result;
}

export async function sampleFlowFieldGpu(
  device: GPUDevice,
  agents: AgentSoA,
  flowField: FlowField,
): Promise<Float32Array> {
  if (agents.count === 0) {
    return new Float32Array();
  }

  device.pushErrorScope("validation");
  device.pushErrorScope("internal");

  const positions = agents.positions.slice(0, agents.count * 2);
  const paramsU32 = new Uint32Array([
    agents.count,
    flowField.layout.columns,
    flowField.layout.rows,
  ]);
  const paramsF32 = new Float32Array([flowField.layout.cellSize]);
  const paramsU32Buffer = createStorageBuffer(
    device,
    "flow-field-params-u32",
    paramsU32.byteLength,
    GPUBufferUsage.COPY_DST,
  );
  const paramsF32Buffer = createStorageBuffer(
    device,
    "flow-field-params-f32",
    paramsF32.byteLength,
    GPUBufferUsage.COPY_DST,
  );
  const positionsBuffer = createStorageBuffer(
    device,
    "flow-field-positions",
    positions.byteLength,
    GPUBufferUsage.COPY_DST,
  );
  const directionsOutBuffer = createStorageBuffer(
    device,
    "flow-field-directions-out",
    agents.count * 2 * Float32Array.BYTES_PER_ELEMENT,
    GPUBufferUsage.COPY_SRC,
  );
  const flowTexture = createFlowFieldTexture(device, flowField);

  device.queue.writeBuffer(paramsU32Buffer, 0, paramsU32);
  device.queue.writeBuffer(paramsF32Buffer, 0, paramsF32);
  device.queue.writeBuffer(positionsBuffer, 0, positions);

  const bindGroupLayout = device.createBindGroupLayout({
    label: "flow-field-bind-group-layout",
    entries: [
      readOnlyStorageBinding(0),
      readOnlyStorageBinding(1),
      readOnlyStorageBinding(2),
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "unfilterable-float",
          viewDimension: "2d",
        },
      },
      storageBinding(4),
    ],
  });
  const pipelineLayout = device.createPipelineLayout({
    label: "flow-field-pipeline-layout",
    bindGroupLayouts: [bindGroupLayout],
  });
  const shaderModule = device.createShaderModule({
    label: "flow-field-sampler-shader",
    code: flowFieldSamplerShader,
  });
  const pipeline = device.createComputePipeline({
    label: "flow-field-sampler-pipeline",
    layout: pipelineLayout,
    compute: {
      module: shaderModule,
      entryPoint: "sample_flow_field",
    },
  });
  const bindGroup = device.createBindGroup({
    label: "flow-field-bind-group",
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: paramsU32Buffer } },
      { binding: 1, resource: { buffer: paramsF32Buffer } },
      { binding: 2, resource: { buffer: positionsBuffer } },
      { binding: 3, resource: flowTexture.createView() },
      { binding: 4, resource: { buffer: directionsOutBuffer } },
    ],
  });
  const commandEncoder = device.createCommandEncoder({
    label: "flow-field-command-encoder",
  });
  const pass = commandEncoder.beginComputePass({
    label: "flow-field-compute-pass",
  });

  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(agents.count / 64));
  pass.end();

  const directionsReadback = enqueueCopyToReadbackBuffer(
    device,
    commandEncoder,
    directionsOutBuffer,
    agents.count * 2,
  );

  device.queue.submit([commandEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();

  const internalError = await device.popErrorScope();
  const validationError = await device.popErrorScope();

  if (internalError || validationError) {
    throw new Error(
      internalError?.message ??
        validationError?.message ??
        "GPU flow field sampling failed",
    );
  }

  const directions = await readFloat32Array(directionsReadback, agents.count * 2);

  paramsU32Buffer.destroy();
  paramsF32Buffer.destroy();
  positionsBuffer.destroy();
  directionsOutBuffer.destroy();
  directionsReadback.destroy();
  flowTexture.destroy();

  return directions;
}
