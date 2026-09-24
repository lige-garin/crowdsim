import {
  createStorageBuffer,
  enqueueCopyToReadbackBuffer,
  readFloat32Array,
  readOnlyStorageBinding,
  storageBinding,
} from "./gpuUtils";
import { clamp } from "./mathUtils";
import { neuralResidualShader } from "./shaders";

export type NeuralResidualGpuFeature = {
  densityPeak: number;
  remainingRatio: number;
  signedSpeedError: number;
  signedThroughputError: number;
};

export type NeuralResidualGpuModel = {
  enabled: boolean;
  hiddenBias: readonly number[];
  hiddenWeights: readonly (readonly number[])[];
  outputBias: readonly number[];
  outputWeights: readonly (readonly number[])[];
  source: string;
  maxResidual?: number;
};

export type NeuralResidualGpuContract = {
  defaultEnabled: false;
  entryPoint: "infer_neural_residual";
  featureVector: "speedError,throughputError,densityPeak,remainingRatio";
  outputVector: "speedResidual,throughputResidual";
  requiresBenchmarkGate: true;
  shaderLabel: "neural-residual-shader";
  source: string;
  workgroupSize: 64;
};

export function describeNeuralResidualGpuContract(
  model: NeuralResidualGpuModel,
): NeuralResidualGpuContract {
  validateNeuralResidualModel(model);

  return {
    defaultEnabled: false,
    entryPoint: "infer_neural_residual",
    featureVector: "speedError,throughputError,densityPeak,remainingRatio",
    outputVector: "speedResidual,throughputResidual",
    requiresBenchmarkGate: true,
    shaderLabel: "neural-residual-shader",
    source: model.source,
    workgroupSize: 64,
  };
}

export function createNeuralResidualFeatureBufferData(
  features: readonly NeuralResidualGpuFeature[],
): Float32Array {
  const data = new Float32Array(features.length * 4);

  features.forEach((feature, index) => {
    const offset = index * 4;
    data[offset] = feature.signedSpeedError;
    data[offset + 1] = feature.signedThroughputError;
    data[offset + 2] = feature.densityPeak;
    data[offset + 3] = feature.remainingRatio;
  });

  return data;
}

export function createNeuralResidualWeightBufferData(
  model: NeuralResidualGpuModel,
): Float32Array {
  validateNeuralResidualModel(model);

  const data = new Float32Array(7 * 4);

  for (let row = 0; row < 3; row++) {
    writeVec4(data, row, model.hiddenWeights[row]);
  }

  writeVec4(data, 3, model.outputWeights[0]);
  writeVec4(data, 4, model.outputWeights[1]);
  writeVec4(data, 5, [
    model.hiddenBias[0] ?? 0,
    model.hiddenBias[1] ?? 0,
    model.hiddenBias[2] ?? 0,
    model.maxResidual ?? 0.12,
  ]);
  writeVec4(data, 6, [
    model.outputBias[0] ?? 0,
    model.outputBias[1] ?? 0,
    model.enabled ? 1 : 0,
    0,
  ]);

  return data;
}

export function inferNeuralResidualBatchCpu(
  features: readonly NeuralResidualGpuFeature[],
  model: NeuralResidualGpuModel,
): Float32Array {
  validateNeuralResidualModel(model);

  const output = new Float32Array(features.length * 2);
  const limit = model.maxResidual ?? 0.12;

  features.forEach((feature, index) => {
    if (!model.enabled) {
      return;
    }

    const input = [
      feature.signedSpeedError,
      feature.signedThroughputError,
      feature.densityPeak,
      feature.remainingRatio,
    ];
    const hidden = model.hiddenWeights.map((weights, hiddenIndex) =>
      Math.tanh(dot(weights, input) + (model.hiddenBias[hiddenIndex] ?? 0)),
    );
    const speedResidual = Math.tanh(
      dot(model.outputWeights[0], hidden) + (model.outputBias[0] ?? 0),
    );
    const throughputResidual = Math.tanh(
      dot(model.outputWeights[1], hidden) + (model.outputBias[1] ?? 0),
    );

    output[index * 2] = clamp(speedResidual, -limit, limit);
    output[index * 2 + 1] = clamp(throughputResidual, -limit, limit);
  });

  return output;
}

export async function inferNeuralResidualBatchGpu(
  device: GPUDevice,
  features: readonly NeuralResidualGpuFeature[],
  model: NeuralResidualGpuModel,
): Promise<Float32Array> {
  describeNeuralResidualGpuContract(model);

  if (features.length === 0) {
    return new Float32Array();
  }

  device.pushErrorScope("validation");
  device.pushErrorScope("internal");

  const params = new Uint32Array([features.length]);
  const featureData = createNeuralResidualFeatureBufferData(features);
  const weightData = createNeuralResidualWeightBufferData(model);
  const outputLength = features.length * 2;
  const paramsBuffer = createStorageBuffer(
    device,
    "neural-residual-params",
    params.byteLength,
    GPUBufferUsage.COPY_DST,
  );
  const featuresBuffer = createStorageBuffer(
    device,
    "neural-residual-features",
    featureData.byteLength,
    GPUBufferUsage.COPY_DST,
  );
  const weightsBuffer = createStorageBuffer(
    device,
    "neural-residual-weights",
    weightData.byteLength,
    GPUBufferUsage.COPY_DST,
  );
  const outputBuffer = createStorageBuffer(
    device,
    "neural-residual-output",
    outputLength * Float32Array.BYTES_PER_ELEMENT,
    GPUBufferUsage.COPY_SRC,
  );

  device.queue.writeBuffer(paramsBuffer, 0, params);
  device.queue.writeBuffer(featuresBuffer, 0, featureData);
  device.queue.writeBuffer(weightsBuffer, 0, weightData);

  const bindGroupLayout = device.createBindGroupLayout({
    label: "neural-residual-bind-group-layout",
    entries: [
      readOnlyStorageBinding(0),
      readOnlyStorageBinding(1),
      readOnlyStorageBinding(2),
      storageBinding(3),
    ],
  });
  const pipelineLayout = device.createPipelineLayout({
    label: "neural-residual-pipeline-layout",
    bindGroupLayouts: [bindGroupLayout],
  });
  const shaderModule = device.createShaderModule({
    label: "neural-residual-shader",
    code: neuralResidualShader,
  });
  const pipeline = device.createComputePipeline({
    label: "neural-residual-pipeline",
    layout: pipelineLayout,
    compute: {
      module: shaderModule,
      entryPoint: "infer_neural_residual",
    },
  });
  const bindGroup = device.createBindGroup({
    label: "neural-residual-bind-group",
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: paramsBuffer } },
      { binding: 1, resource: { buffer: featuresBuffer } },
      { binding: 2, resource: { buffer: weightsBuffer } },
      { binding: 3, resource: { buffer: outputBuffer } },
    ],
  });
  const commandEncoder = device.createCommandEncoder({
    label: "neural-residual-command-encoder",
  });
  const pass = commandEncoder.beginComputePass({
    label: "neural-residual-compute-pass",
  });

  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(features.length / 64));
  pass.end();

  const readback = enqueueCopyToReadbackBuffer(
    device,
    commandEncoder,
    outputBuffer,
    outputLength,
  );

  device.queue.submit([commandEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();

  const internalError = await device.popErrorScope();
  const validationError = await device.popErrorScope();

  if (internalError || validationError) {
    throw new Error(
      internalError?.message ??
        validationError?.message ??
        "GPU neural residual command failed",
    );
  }

  const result = await readFloat32Array(readback, outputLength);

  paramsBuffer.destroy();
  featuresBuffer.destroy();
  weightsBuffer.destroy();
  outputBuffer.destroy();
  readback.destroy();

  return result;
}

function validateNeuralResidualModel(model: NeuralResidualGpuModel) {
  if (model.hiddenWeights.length !== 3 || model.outputWeights.length !== 2) {
    throw new Error("Neural residual WGSL path expects a 4-3-2 MLP.");
  }

  if (
    model.hiddenWeights.some((weights) => weights.length !== 4) ||
    model.outputWeights.some((weights) => weights.length !== 3)
  ) {
    throw new Error("Neural residual WGSL weights have invalid dimensions.");
  }
}

function writeVec4(data: Float32Array, row: number, values: readonly number[]) {
  const offset = row * 4;

  data[offset] = values[0] ?? 0;
  data[offset + 1] = values[1] ?? 0;
  data[offset + 2] = values[2] ?? 0;
  data[offset + 3] = values[3] ?? 0;
}

function dot(left: readonly number[], right: readonly number[]) {
  return left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
}
