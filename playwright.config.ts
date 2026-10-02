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
        // The homepage's three.js hero renders exactly one static frame under
        // reduced motion (see CityHeroScene.tsx). Without this, continuous
        // WebGL saturates the main thread — tolerable on a local GPU, but it
        // starved every click on the 2-core CI runner until tests timed out.
        // This also keeps local runs testing the same code path as CI.
        //
        // It must live under `contextOptions`: Playwright 1.61's runner only
        // models colorScheme/deviceScaleFactor/viewport/... as direct `use`
        // keys. A bare `use.reducedMotion` is silently dropped on the floor
        // (verified against playwright/lib/index.js's fixture table and a
        // real trace: `"reducedMotion": "undefined"` in the created context).
        contextOptions: {
          reducedMotion: "reduce",
        },
      },
    },
  ],
  reporter: isCi ? [["list"], ["html", { open: "never" }]] : "list",
  testDir: "./e2e",
  timeout: 30_000,
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
