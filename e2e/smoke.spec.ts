import { expect, test } from "@playwright/test";

test("opens the workbench and starts a live simulation", async ({ page }) => {
  const runtimeErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      runtimeErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    runtimeErrors.push(error.message);
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "CrowdSim Operations" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "EN" }).click();
  await page.getByRole("button", { name: "Open console" }).click();

  await expect(page.getByRole("heading", { name: "Control Room" })).toBeVisible();
  await expect(page.getByText("100,000 visual agents")).toBeVisible();
  await expect(page.getByText("WebGPU render benchmark")).toBeVisible();
  await expect(page.getByText("cpu-compat active @ 60Hz")).toBeVisible();
  await expect(page.getByText("WebGPU movement")).toBeVisible();
  await expect(page.getByText("wasm-ready @ 10Hz")).toBeVisible();
  await expect(page.getByText("Decision ticks")).toBeVisible();
  await expect(page.getByText("Shared memory")).toBeVisible();
  await expect(page.getByText(/SAB (ready|fallback)/)).toBeVisible();
  await expect(page.getByText("Simulation agent limit")).toBeVisible();
  await expect(page.getByText("Credibility loop")).toBeVisible();
  await expect(page.getByText(/scene=atrium-demo/)).toBeVisible();
  await expect(
    page.getByText(/Main thread GPU movement active|worker \|/),
  ).toBeVisible();
  const controls = page.getByRole("region", { name: "Simulation controls" });

  await expect(controls.getByRole("heading", { name: "Paused" })).toBeVisible();

  await controls.getByRole("button", { name: "Start" }).click();

  await expect(controls.getByRole("heading", { name: "Running" })).toBeVisible();
  await expect(controls.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect
    .poll(() => page.locator(".editor-live-agent").count(), {
      timeout: 8_000,
    })
    .toBeGreaterThan(0);

  expect(runtimeErrors).toEqual([]);
});
