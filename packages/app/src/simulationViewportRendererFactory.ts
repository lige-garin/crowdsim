import { WebGLRenderer } from "three";
import { WebGPURenderer } from "three/webgpu";

import { performanceBenchmarkFrames } from "./renderBenchmark";

export function createGpuViewportRenderer(
  canvas: HTMLCanvasElement,
  device: GPUDevice,
) {
  const renderer = new WebGPURenderer({
    alpha: true,
    antialias: false,
    canvas,
    device,
    powerPreference: "high-performance",
    stencil: false,
  });
  renderer.shadowMap.enabled = true;
  return renderer;
}

export function createFallbackViewportRenderer(canvas: HTMLCanvasElement) {
  const renderer = new WebGLRenderer({
    alpha: true,
    antialias: false,
    canvas,
    powerPreference: "high-performance",
    stencil: false,
  });
  renderer.shadowMap.enabled = true;
  return renderer;
}

export async function benchmarkViewportRenderer(
  device: GPUDevice,
  renderFrame: (time: number) => void,
) {
  const sampleFrames = performanceBenchmarkFrames;
  const startedAt = performance.now();

  for (let index = 0; index < sampleFrames; index++) {
    renderFrame(startedAt + index * (1000 / 60));
  }

  await device.queue.onSubmittedWorkDone();

  return (sampleFrames * 1000) / Math.max(1, performance.now() - startedAt);
}
