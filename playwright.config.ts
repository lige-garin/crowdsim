import { defineConfig, devices } from "@playwright/test";

const isCi = Boolean(process.env.CI);

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  projects: [
    {
      name: isCi ? "chromium" : "chrome",
      use: {
        ...devices["Desktop Chrome"],
        ...(isCi ? {} : { channel: "chrome" }),
        // ubuntu-latest has no GPU. Chromium still exposes navigator.gpu there,
        // but requestAdapter() returns null, so the viewport takes its
        // fail-loud branch (ADR-0006) and the unsupported card covers the
        // canvas — every test that clicks the 3D city is blocked by it. These
        // flags give the runner a software adapter through SwiftShader.
        // Local runs keep the real GPU and no extra flags.
        launchOptions: isCi
          ? {
              args: [
                "--enable-unsafe-webgpu",
                "--enable-features=Vulkan",
                "--use-angle=swiftshader",
                "--use-gl=angle",
                "--enable-unsafe-swiftshader",
              ],
            }
          : {},
      },
    },
  ],
  reporter: isCi ? [["list"], ["html", { open: "never" }]] : "list",
  testDir: "./e2e",
  // Software rendering on the runner is several times slower than the local
  // GPU, and one case waits for the simulated clock to reach three seconds
  // before it clicks. The CI-only figure is an environment allowance, not a
  // tolerance for the app getting slower: if a case starts needing it locally,
  // the app regressed.
  timeout: isCi ? 90_000 : 30_000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev:e2e",
    reuseExistingServer: !isCi,
    timeout: 120_000,
    // Poll a crowdsim-specific module, not "/". reuseExistingServer blindly
    // trusts whatever answers on 5173 — when another dev server (a different
    // product) holds the port, every test "passes its checks" against the
    // wrong app. /src/main.tsx 404s on any other project, so a foreign server
    // is never mistaken for ours; strictPort makes vite fail loudly instead of
    // silently drifting to 5174.
    url: "http://127.0.0.1:5173/src/main.tsx",
    strictPort: true,
  },
});
