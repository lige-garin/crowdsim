import { defineConfig } from "vitest/config";

// SP-1 real-WebGPU harness config. Runs only the *.webgpu.ts parity/benchmark
// specs under test-webgpu/. In Node (no navigator.gpu) every spec self-skips, so
// `pnpm test:webgpu` stays green-but-skipped here; on a real WebGPU machine
// (vitest browser mode with the Playwright provider, or the `webgpu` node
// package supplying navigator.gpu) the specs execute against a real device.
export default defineConfig({
  test: {
    include: ["test-webgpu/**/*.webgpu.ts"],
  },
});
