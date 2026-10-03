import { expect, test, type Page } from "@playwright/test";

/**
 * The customer journey the 2026-10-02 review asked for (P1 #12): template →
 * edit → simulate → export. One continuous walk, in basic mode — the mode a
 * paying customer actually lands in — not a collage of the smoke suite's
 * expert-mode pieces.
 *
 * Anchors stay on testid/ARIA per the house rule in smoke.spec.ts: visible
 * strings are localized and drift.
 */

type ErrorSink = { messages: string[] };

function captureRuntimeErrors(page: Page): ErrorSink {
  const sink: ErrorSink = { messages: [] };
  page.on("console", (message) => {
    if (message.type() === "error") {
      sink.messages.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    sink.messages.push(error.message);
  });
  return sink;
}

test("template → edit → simulate → CSV + report, end to end", async ({ page }) => {
  // Inner polls (engine start, samples, applied scene, report) already sum
  // past the 30 s default on a slow machine; software-WebGL compat mode
  // stretches every step further. On CI the 2-core software-WebGL runner
  // gets the same 480 s floor as the smoke specs (ciBudgetFloor there).
  test.setTimeout(Math.max(150_000, process.env.CI ? 480_000 : 0));
  const errors = captureRuntimeErrors(page);

  await page.goto("/");

  // Step 1 — pick a template (basic mode lands on the gallery).
  const firstCard = page.locator("button.template-card").first();
  await expect(firstCard).toBeVisible();
  await firstCard.click();

  // Steps 2 and 3 — the run starts by itself and the dashboard opens with it.
  const simToggle = page.getByTestId("sim-toggle");
  await expect(simToggle).toHaveAttribute("aria-label", /Pause|暂停/, {
    timeout: 20_000,
  });
  await expect(page.getByTestId("hud-window-analytics")).toBeVisible();

  // The customer's own edit: a count line, the object whose whole job is the
  // number they will export at the end.
  await page.getByTestId("stage-tab-edit").click();
  const canvas = page.getByTestId("editor-canvas");
  await expect(canvas).toBeVisible();
  const linesBefore = await page.locator(".editor-count-line").count();

  await page.getByTestId("editor-tool-countLine").click();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  // A vertical drag inside the world's letterboxed area (edge-relative
  // positions can land in the dead margin — see smoke.spec.ts).
  const startX = box!.x + box!.width * 0.5;
  const startY = box!.y + box!.height * 0.45;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + box!.height * 0.2, { steps: 5 });
  await page.mouse.up();

  await expect
    .poll(() => page.locator(".editor-count-line").count(), { timeout: 5_000 })
    .toBe(linesBefore + 1);

  // Apply it and the run keeps going on the new geometry (ADR-0007).
  await page.getByTestId("editor-apply-scene").click();
  await expect(simToggle).toHaveAttribute("aria-label", /Pause|暂停/, {
    timeout: 20_000,
  });

  // Export the line flows as a real CSV file download. The buttons stay
  // disabled until the run has recorded its first simulated second.
  const exportFlows = page.getByTestId("export-flows");
  await expect(exportFlows).toBeEnabled({ timeout: 20_000 });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    exportFlows.click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-flows-\d+s\.csv$/);

  const csvPath = await download.path();
  expect(csvPath).not.toBeNull();

  // Step 4 — the report, from basic mode's own one-click trigger.
  await page.getByTestId("hud-report-trigger").click();
  await expect(page.getByTestId("hud-window-report")).toBeVisible();

  expect(errors.messages).toEqual([]);
});
