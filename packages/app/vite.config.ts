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
    // Half the cores, not all of them. The heavy cases here render every panel
    // or step a simulation for a minute of sim time, and with a fork per core
    // they starve each other: a fully green suite would fail two or three
    // arbitrary cases on a test timeout, a different set each run. Measured on
    // this machine: over-subscribed, three cases timed out; at half the cores,
    // 686 passed. Slower overall, but a timeout that moves around is worse
    // than a slower run.
    maxWorkers: "50%",
  },
});
