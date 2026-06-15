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
    url: "http://127.0.0.1:5173",
  },
});
