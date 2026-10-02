import {
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { WebGPURenderer } from "three/webgpu";

import { performanceBenchmarkFrames } from "../viewport/renderBenchmark";

export function createGpuViewportRenderer(
  canvas: HTMLCanvasElement,
  device: GPUDevice,
) {
  const renderer = new WebGPURenderer({
    alpha: true,
    antialias: true,
    canvas,
    device,
    powerPreference: "high-performance",
    stencil: false,
  });
  configureViewportRenderer(renderer);

  return renderer;
}

export function createFallbackViewportRenderer(canvas: HTMLCanvasElement) {
  const renderer = new WebGLRenderer({
    alpha: true,
    antialias: true,
    canvas,
    powerPreference: "high-performance",
    // The compatibility mode is the path a screenshot/export (or a test's
    // readback) takes on machines without WebGPU, and without this flag the
    // drawing buffer is cleared after present — those readbacks see a blank
    // canvas even while frames are visibly rendering. The modest cost is
    // exactly what ADR-0006's "scale-limited compatibility mode" exists to
    // absorb; the full-GPU path keeps the default.
    preserveDrawingBuffer: true,
    stencil: false,
  });
  configureViewportRenderer(renderer);

  return renderer;
}

function configureViewportRenderer(renderer: WebGLRenderer | WebGPURenderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
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
