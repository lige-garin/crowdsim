import { expect, test, type Page } from "@playwright/test";

/**
 * The journey the new-project flow introduced and nothing else covered:
 * new project → place it → fill it in → it persists → reopening it lands
 * in the workbench. Written as one continuous walk rather than four
 * checks, because the failure this is guarding is between the steps — a
 * wizard that opens step 3 with step 2's coordinate missing, or a save
 * that reports success and writes nothing.
 *
 * Anchors stay on testid/ARIA per the house rule in smoke.spec.ts:
 * visible strings are localized and drift.
 *
 * It runs without an Amap key on purpose. That is the default on CI and
 * the path a self-hosted deployment takes, and it is the one where the
 * map step's coordinate fallback has to carry the whole step.
 */

function captureRuntimeErrors(page: Page): string[] {
  const messages: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") messages.push(message.text());
  });
  page.on("pageerror", (error) => {
    messages.push(error.message);
  });
  return messages;
}

/**
 * Every test starts from an empty store. They share one origin, so without
 * this the second test would find the first one's project still there and
 * `project-list-empty` — the assertion that the list is honestly empty —
 * would never hold.
 */
async function clearProjects(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("crowdsim.projects.v1"));
  await page.reload();
}

test("new project → place → fill in → it is still there when you come back", async ({
  page,
}) => {
  test.setTimeout(Math.max(120_000, process.env.CI ? 480_000 : 0));
  const errors = captureRuntimeErrors(page);

  await clearProjects(page);

  // Step 1 — the list is empty, and says so rather than showing a blank page.
  await expect(page.getByTestId("project-list-empty")).toBeVisible();
  await page.getByTestId("project-create").click();

  // Step 2 — place it. Without a key there is no base map, and the step has
  // to say that instead of leaving an empty box where the map should be.
  await expect(page.getByTestId("map-nokey")).toBeVisible();
  const lat = page.getByTestId("map-lat");
  await expect(lat).toBeVisible();
  await lat.fill("41.8057");
  await page.getByTestId("map-lng").fill("123.4315");
  await page.getByTestId("map-radius").fill("1500");
  await page.getByTestId("map-next").click();

  // Step 3 — the point chosen a step earlier is still there. Asserted on the
  // form's own location line: the catchment panel names the radius too.
  const where = page.locator(".project-details-where");
  await expect(where).toContainText(/41\.8057/);
  await expect(where).toContainText(/1500/);

  // The catchment panel starts empty and says it is empty. A panel that
  // showed zeros here would be claiming the site has nothing around it.
  await expect(page.getByTestId("catchment-idle")).toBeVisible();
  await expect(page.getByTestId("catchment-ask")).toBeDisabled();

  await page.getByTestId("details-name").fill("中街商场");
  await page.getByTestId("details-submit").click();

  // Step 4 — submitting opens the workbench on the new scene straight away,
  // rather than sending you back to the list.
  await expect(page.getByTestId("sim-toggle")).toBeVisible({ timeout: 30_000 });

  // Edit the project's own scene and apply it. This must update the project
  // record, not only the editor's generic last-scene slot.
  await page.getByTestId("stage-tab-edit").click();
  const canvas = page.getByTestId("editor-canvas");
  await page.getByRole("button", { name: "实时分析 ×" }).click();
  const shopsBefore = await page.locator("g.editor-shop").count();
  await page.getByTestId("editor-tool-shop").click();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await canvas.click({ position: { x: box!.width * 0.5, y: box!.height * 0.55 } });
  await expect.poll(() => page.locator("g.editor-shop").count()).toBe(shopsBefore + 1);
  await page.getByTestId("editor-apply-scene").click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const projects = JSON.parse(
          localStorage.getItem("crowdsim.projects.v1") ?? "[]",
        ) as { scene?: { shops?: unknown[] } }[];
        return projects[0]?.scene?.shops?.length ?? 0;
      }),
    )
    .toBe(shopsBefore + 1);

  // Step 5 — and it is really stored, which is a different claim from "it
  // opened": a save that wrote nothing would look identical from in here. Back
  // home is where the store is read back.
  await page.getByRole("button", { name: "首页" }).click();
  const card = page.locator("li", { hasText: "中街商场" }).first();
  await expect(card).toBeVisible();
  await expect(page.getByTestId("project-list-empty")).toHaveCount(0);

  // Reopening it lands in the workbench again: the stored scene has to still
  // be loadable, not just storable.
  await card.locator("button").first().click();
  await expect(page.getByTestId("sim-toggle")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("stage-tab-edit").click();
  await expect(page.locator("g.editor-shop")).toHaveCount(shopsBefore + 1);

  expect(errors).toEqual([]);
});

test("the project survives a reload, because it is the store and not the page", async ({
  page,
}) => {
  test.setTimeout(Math.max(120_000, process.env.CI ? 480_000 : 0));
  const errors = captureRuntimeErrors(page);

  await clearProjects(page);
  await page.getByTestId("project-create").click();
  await page.getByTestId("map-lat").fill("41.9");
  await page.getByTestId("map-lng").fill("123.5");
  await page.getByTestId("map-next").click();
  await page.getByTestId("details-name").fill("太原街店");
  await page.getByTestId("details-submit").click();
  await expect(page.getByTestId("sim-toggle")).toBeVisible({ timeout: 30_000 });

  // localStorage is per-origin, so the project has to come back on a fresh
  // page load. A wizard that kept it only in memory would pass every other
  // step here and fail this one.
  await page.goto("/");
  await expect(page.locator("li", { hasText: "太原街店" })).toHaveCount(1);
  await expect(page.getByTestId("project-list-empty")).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("cancelling a new project does not leave the next one on the old coordinate", async ({
  page,
}) => {
  test.setTimeout(Math.max(120_000, process.env.CI ? 480_000 : 0));
  const errors = captureRuntimeErrors(page);

  await clearProjects(page);
  await page.getByTestId("project-create").click();
  await page.getByTestId("map-lat").fill("41.8057");
  await page.getByTestId("map-lng").fill("123.4315");
  await page.getByTestId("map-next").click();
  await expect(page.getByTestId("details-name")).toBeVisible();

  // Cancel from the form, then start again.
  await page.getByTestId("details-cancel").click();
  await expect(page.getByTestId("project-list-empty")).toBeVisible();

  await page.getByTestId("project-create").click();
  // The map step, not the form: a cancel that left the coordinate behind
  // would jump straight to step 3 on the previous project's point.
  await expect(page.getByTestId("map-lat")).toBeVisible();
  await expect(page.getByTestId("details-name")).toHaveCount(0);

  expect(errors).toEqual([]);
});
