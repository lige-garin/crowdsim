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
