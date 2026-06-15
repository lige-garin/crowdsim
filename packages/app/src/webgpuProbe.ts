export type WebGpuProbeResult =
  | {
      status: "ready";
      supported: true;
      input: number[];
      output: number[];
      message: string;
    }
  | {
      status: "unsupported" | "error";
      supported: false;
      input: number[];
      output: number[];
      message: string;
    };

const probeInput = new Float32Array([1, 2, 3, 4]);

export async function runWebGpuProbe(): Promise<WebGpuProbeResult> {
  if (!("gpu" in navigator) || !navigator.gpu) {
    return {
      status: "unsupported",
      supported: false,
      input: Array.from(probeInput),
      output: [],
      message: "WebGPU unavailable",
    };
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();

    if (!adapter) {
      return {
        status: "unsupported",
        supported: false,
        input: Array.from(probeInput),
        output: [],
        message: "No WebGPU adapter",
      };
    }

    const device = await adapter.requestDevice();
    const output = await runDoubleArrayCompute(device, probeInput);
    device.destroy();

    return {
      status: "ready",
      supported: true,
      input: Array.from(probeInput),
      output,
      message: "Compute shader complete",
    };
  } catch (error) {
    return {
      status: "error",
      supported: false,
      input: Array.from(probeInput),
      output: [],
      message: error instanceof Error ? error.message : "WebGPU probe failed",
    };
  }
}

async function runDoubleArrayCompute(
  device: GPUDevice,
  input: Float32Array,
): Promise<number[]> {
  const byteLength = input.byteLength;
  const inputBuffer = device.createBuffer({
    label: "probe-input",
    size: byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const outputBuffer = device.createBuffer({
    label: "probe-output",
    size: byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const readbackBuffer = device.createBuffer({
    label: "probe-readback",
    size: byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  device.queue.writeBuffer(inputBuffer, 0, input);

  const shaderModule = device.createShaderModule({
    label: "probe-double-array",
    code: `
      @group(0) @binding(0) var<storage, read> inputData: array<f32>;
      @group(0) @binding(1) var<storage, read_write> outputData: array<f32>;

      @compute @workgroup_size(4)
      fn main(@builtin(global_invocation_id) id: vec3<u32>) {
        let index = id.x;
        if (index < 4u) {
          outputData[index] = inputData[index] * 2.0;
        }
      }
    `,
  });
  const pipeline = device.createComputePipeline({
    label: "probe-pipeline",
    layout: "auto",
    compute: {
      module: shaderModule,
      entryPoint: "main",
    },
  });
  const bindGroup = device.createBindGroup({
    label: "probe-bind-group",
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: inputBuffer } },
      { binding: 1, resource: { buffer: outputBuffer } },
    ],
  });
  const commandEncoder = device.createCommandEncoder({
    label: "probe-commands",
  });
  const passEncoder = commandEncoder.beginComputePass({
    label: "probe-compute-pass",
  });

  passEncoder.setPipeline(pipeline);
  passEncoder.setBindGroup(0, bindGroup);
  passEncoder.dispatchWorkgroups(1);
  passEncoder.end();
  commandEncoder.copyBufferToBuffer(outputBuffer, 0, readbackBuffer, 0, byteLength);

  device.queue.submit([commandEncoder.finish()]);

  await readbackBuffer.mapAsync(GPUMapMode.READ);
  const mapped = readbackBuffer.getMappedRange();
  const result = Array.from(new Float32Array(mapped.slice(0)));
  readbackBuffer.unmap();

  inputBuffer.destroy();
  outputBuffer.destroy();
  readbackBuffer.destroy();

  return result;
}
