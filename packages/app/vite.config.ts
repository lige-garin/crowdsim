import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const crossOriginIsolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 750,
  },
  server: {
    headers: crossOriginIsolationHeaders,
  },
  preview: {
    headers: crossOriginIsolationHeaders,
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/setupTests.ts",
    css: true,
    // Forks instead of threads: some handle created on the SceneEditor path
    // (worker/MessagePort in jsdom) survives thread-worker teardown, so a fully
    // green run never exits (CI killed it at the timeout, exit 124). Fork
    // workers are processes and get torn down for real.
    pool: "forks",
  },
});
