import { expect, test, type Page } from "@playwright/test";

/**
 * These specs guard real user journeys, not copy. They deliberately anchor on
 * `data-testid` and ARIA roles rather than on visible strings: the previous
 * suite asserted six labels that no longer existed anywhere in the UI, so it
 * could never pass and the gate silently stopped guarding anything.
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

/**
 * True when the canvas has drawn something other than a flat background.
 * Direct 2D scratch-canvas readback (drawImage) works for WebGL and 2D
 * contexts, but on WebGPU canvases it reads a cleared buffer, so it reports a
 * rendering viewport as empty. For those, decode the canvas's own
 * toDataURL() snapshot (which captures the presented frame) and run the same
 * pixel-variance check on it.
 */
async function canvasHasContent(page: Page) {
  return page.evaluate(async () => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-testid="viewport-canvas"]',
    );

    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      return false;
    }

    const hasVariance = (data: Uint8ClampedArray) => {
      const first = [data[0], data[1], data[2]];

      for (let index = 4; index < data.length; index += 4) {
        if (
          Math.abs(data[index] - first[0]) > 6 ||
          Math.abs(data[index + 1] - first[1]) > 6 ||
          Math.abs(data[index + 2] - first[2]) > 6
        ) {
          return true;
        }
      }

      return false;
    };

    // Fast path: works for WebGL and 2D contexts.
    const scratch = document.createElement("canvas");
    scratch.width = Math.min(canvas.width, 320);
    scratch.height = Math.min(canvas.height, 180);
    const context = scratch.getContext("2d");

    if (context) {
      context.drawImage(canvas, 0, 0, scratch.width, scratch.height);
      if (hasVariance(context.getImageData(0, 0, scratch.width, scratch.height).data)) {
        return true;
      }
    }

    // WebGPU path: decode the canvas snapshot.
    try {
      const blob = await (await fetch(canvas.toDataURL())).blob();
      const bitmap = await createImageBitmap(blob);
      const snapshot = document.createElement("canvas");
      snapshot.width = 80;
      snapshot.height = 45;
      const snapContext = snapshot.getContext("2d");

      if (!snapContext) {
        return false;
      }

      snapContext.drawImage(bitmap, 0, 0, 80, 45);
      return hasVariance(snapContext.getImageData(0, 0, 80, 45).data);
    } catch {
      return false;
    }
  });
}

/**
 * The app boots into a landing page (AppHome) whose primary action enters the
 * workbench. Tests used to assume `/` was the workbench itself, so the whole
 * suite failed the moment the landing page shipped. The journey now includes
 * this click; the primary button is matched by its stable class because its
 * label is localized (进入运营台 / Open console).
 */
async function enterWorkbench(page: Page) {
  const enter = page.locator("button.home-primary");
  await expect(enter).toBeVisible();
  await enter.click();
}

test("workbench boots into a running simulation and renders a crowd", async ({
  page,
}) => {
  const errors = captureRuntimeErrors(page);

  await page.goto("/");
  await enterWorkbench(page);

  // Transport lives in the HUD status bar and is icon-only, so the toggle's
  // state reads from its accessible name rather than from visible text.
  const simToggle = page.getByTestId("sim-toggle");
  await expect(simToggle).toBeVisible();

  // The workbench auto-starts; the toggle flipping to Pause proves the engine
  // actually reached `running` rather than merely rendering a Start button.
  await expect(simToggle).toHaveAttribute("aria-label", /Pause|暂停/, {
    timeout: 20_000,
  });

  await expect(page.getByTestId("viewport-canvas")).toBeVisible();

  // The viewport must reach a state the user can read: either it draws the
  // scene, or it says out loud that this machine cannot render it. A black
  // rectangle with no explanation counts as a failure, which is what a bare
  // `canvasHasContent` assertion would have let through on GPU-less CI.
  await expect
    .poll(
      async () =>
        (await canvasHasContent(page)) ||
        (await page.getByTestId("viewport-unsupported").count()) > 0,
      { timeout: 25_000 },
    )
    .toBe(true);

  // Agents must actually appear in the 2D editor overlay, which is fed by the
  // same snapshot as the 3D viewport. It lives on the edit tab now, so this
  // still proves the snapshot reaches a renderer even on a GPU-less machine
  // where the 3D viewport can only show its unsupported card.
  await page.getByTestId("stage-tab-edit").click();
  await expect
    .poll(() => page.locator(".editor-live-agent").count(), { timeout: 30_000 })
    .toBeGreaterThan(0);
  await page.getByTestId("view-mode-3d").click();

  await simToggle.click();
  await expect(simToggle).toHaveAttribute("aria-label", /Start|开始/);

  expect(errors.messages).toEqual([]);
});

/**
 * Counts `navigator.gpu.requestAdapter` calls from page load on. Each call is
 * a renderer rebuild (GPU device, benchmark, city), so growth is the signal.
 * Must be called before `page.goto`.
 */
async function countGpuAdapterRequests(page: Page) {
  await page.addInitScript(() => {
    const target = (navigator as Navigator & { gpu?: GPU }).gpu;
    const counters = window as typeof window & { __gpuAdapterRequests?: number };
    counters.__gpuAdapterRequests = 0;

    if (!target) {
      return;
    }

    const original = target.requestAdapter.bind(target);
    target.requestAdapter = (options?: GPURequestAdapterOptions) => {
      counters.__gpuAdapterRequests = (counters.__gpuAdapterRequests ?? 0) + 1;
      return original(options);
    };
  });
  return () =>
    page.evaluate(
      () =>
        (window as typeof window & { __gpuAdapterRequests?: number })
          .__gpuAdapterRequests ?? 0,
    );
}

test("viewport initialises the GPU once, not once per simulated second", async ({
  page,
}) => {
  // Regression guard for the scene-rebuild loop: the viewport effect used to
  // depend on `heatmapCells` and the 5s visual clock, so it tore down and
  // rebuilt the renderer — including `requestAdapter`/`requestDevice` and a
  // blocking 45-frame benchmark — roughly once per simulated second, leaking a
  // GPUDevice each time. Counting adapter requests is the cheapest way to see
  // that from the outside, and it works whether or not the machine has WebGPU.
  const readRequests = await countGpuAdapterRequests(page);

  await page.goto("/");
  await enterWorkbench(page);

  await expect(page.getByTestId("sim-toggle")).toHaveAttribute(
    "aria-label",
    /Pause|暂停/,
    { timeout: 20_000 },
  );

  // Startup also fires a fixed set of one-shot capability probes, so the
  // absolute count is not the signal — growth over time is. Before the fix this
  // climbed by roughly one per simulated second and never stopped.
  await page.waitForTimeout(3_000);
  const settled = await readRequests();

  await page.waitForTimeout(12_000);
  const later = await readRequests();

  expect(later).toBe(settled);
});

test("editor places an entity, undoes it, and keeps the document consistent", async ({
  page,
}) => {
  const errors = captureRuntimeErrors(page);

  await page.goto("/");
  await enterWorkbench(page);

  // The stage opens on the run tab; the editor is a peer tab, not a panel
  // parked below the fold in the same scrolling column.
  await expect(page.getByTestId("editor-canvas")).toHaveCount(0);
  await page.getByTestId("stage-tab-edit").click();

  const canvas = page.getByTestId("editor-canvas");
  await expect(canvas).toBeVisible();
  await expect(canvas).toBeInViewport();

  const countShops = () => page.locator("g.editor-shop").count();
  const before = await countShops();

  await page.getByTestId("editor-tool-shop").click();
  await expect(page.getByTestId("editor-tool-shop")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Click through the element, not at absolute page coordinates: the canvas
  // keeps the scene's aspect ratio, so a wide box letterboxes the plan and an
  // edge-relative click can land in the dead margin outside the world.
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await canvas.click({
    position: { x: box!.width * 0.5, y: box!.height * 0.55 },
  });

  await expect.poll(countShops, { timeout: 5_000 }).toBeGreaterThan(before);

  const undo = page.getByTestId("editor-undo");
  await expect(undo).toBeEnabled();
  await undo.click();

  await expect.poll(countShops, { timeout: 5_000 }).toBe(before);

  expect(errors.messages).toEqual([]);
});

test("panel dock opens panels without runtime errors or long freezes", async ({
  page,
}) => {
  const errors = captureRuntimeErrors(page);

  await page.goto("/");
  await enterWorkbench(page);

  // Nothing is docked any more: the panels live in a floating window opened
  // from the info rail.
  await expect(page.getByRole("region", { name: /Tool panels|工具面板/ })).toHaveCount(
    0,
  );
  await page.getByTestId("info-window-tools").click();

  const dock = page.getByRole("region", { name: /Tool panels|工具面板/ });
  await expect(dock).toBeVisible();

  /**
   * Every registered panel must be ON SCREEN, not merely in the DOM. This
   * suite used to only click chips, and `chip.click()` auto-scrolls its
   * container first — so it stayed green while a stray `grid-column: auto`
   * squeezed the dock into the 238px sidebar track and left 12 of the 13
   * chips inside a scrollbar-less horizontal scroller. Reachable-by-Playwright
   * is not reachable-by-human; assert the human version.
   */
  const chips = page.locator('[data-testid^="panel-chip-"]');
  const chipCount = await chips.count();
  expect(chipCount).toBeGreaterThanOrEqual(13);

  for (let index = 0; index < chipCount; index += 1) {
    const chip = chips.nth(index);
    await expect(chip, `panel chip ${index} must be visible`).toBeVisible();
    await expect(chip, `panel chip ${index} must be on screen`).toBeInViewport({
      ratio: 1,
    });
  }

  for (const id of ["validation-report", "brand-intelligence", "scale-readiness"]) {
    const chip = page.getByTestId(`panel-chip-${id}`);
    await chip.click();
    await expect(page.getByTestId("panel-dock-body")).toBeVisible();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
  }

  expect(errors.messages).toEqual([]);
});

/**
 * The product's main line: change the scene, apply it, and keep watching.
 *
 * This was silently broken. The auto-start latch was once-per-session, but
 * applying an edit rebuilds the worker on the new geometry and a fresh engine
 * starts paused — so "apply to simulation" emptied the city to zero agents and
 * left it there until the user found the play button. Every step of the loop
 * worked in isolation, which is why nothing caught it; only walking the whole
 * loop does.
 */
test("edit, apply, and the run keeps going on the new scene", async ({ page }) => {
  const errors = captureRuntimeErrors(page);

  await page.goto("/");
  await enterWorkbench(page);

  const simToggle = page.getByTestId("sim-toggle");
  const agentCount = async () =>
    Number(
      (await page.getByTestId("hud-agent-count").innerText()).replace(/[^\d]/g, ""),
    );

  // The run is live before the edit.
  await expect(simToggle).toHaveAttribute("aria-label", /Pause|暂停/, {
    timeout: 20_000,
  });
  await expect.poll(agentCount, { timeout: 20_000 }).toBeGreaterThan(0);

  // Draw a shop the scene did not have.
  await page.getByTestId("stage-tab-edit").click();
  const canvas = page.getByTestId("editor-canvas");
  await expect(canvas).toBeVisible();
  const shopsBefore = await page.locator("g.editor-shop").count();

  await page.getByTestId("build-category-commerce").click();
  await page.getByTestId("palette-shop").click();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await canvas.click({ position: { x: box!.width * 0.5, y: box!.height * 0.62 } });
  await expect
    .poll(() => page.locator("g.editor-shop").count(), { timeout: 5_000 })
    .toBeGreaterThan(shopsBefore);

  // Apply it. Same world and seed, so the geometry is swapped into the running
  // engine (ADR-0007); a re-init would also have to come back by itself.
  await page.getByTestId("editor-apply-scene").click();
  await expect(simToggle).toHaveAttribute("aria-label", /Pause|暂停/, {
    timeout: 20_000,
  });
  await expect.poll(agentCount, { timeout: 25_000 }).toBeGreaterThan(0);

  expect(errors.messages).toEqual([]);
});

/**
 * The other half of that contract: auto-restart must not override a person who
 * deliberately stopped the run.
 */
test("applying an edit does not override a deliberate pause", async ({ page }) => {
  await page.goto("/");
  await enterWorkbench(page);

  const simToggle = page.getByTestId("sim-toggle");
  await expect(simToggle).toHaveAttribute("aria-label", /Pause|暂停/, {
    timeout: 20_000,
  });

  await simToggle.click();
  await expect(simToggle).toHaveAttribute("aria-label", /Start|开始/);

  await page.getByTestId("stage-tab-edit").click();
  await page.getByTestId("editor-apply-scene").click();
  await page.waitForTimeout(2_500);

  await expect(simToggle).toHaveAttribute("aria-label", /Start|开始/);

  // And the user can still resume by hand.
  await simToggle.click();
  await expect(simToggle).toHaveAttribute("aria-label", /Pause|暂停/, {
    timeout: 20_000,
  });
});

/**
 * Building in the city itself: hold a tool, click the ground, and the scene
 * gains it — no trip to the 2D editor. Undo walks it back. The run keeps going
 * on the new geometry.
 */
test("build straight into the 3D city and undo it", async ({ page }) => {
  const errors = captureRuntimeErrors(page);
  const readAdapterRequests = await countGpuAdapterRequests(page);

  await page.goto("/");
  await enterWorkbench(page);
  const simToggle = page.getByTestId("sim-toggle");
  await expect(simToggle).toHaveAttribute("aria-label", /Pause|暂停/, {
    timeout: 20_000,
  });

  // An entrance: a marker, never refused for what it lands on, so the click at
  // the viewport centre is a placement whatever the camera happens to frame.
  await page.getByTestId("build-category-flow").click();
  await page.getByTestId("palette-source").click();
  // Still in the city, not the editor.
  await expect(page.getByTestId("editor-canvas")).toHaveCount(0);
  const undo = page.getByTestId("build-undo");
  await expect(undo).toBeDisabled();

  // The HUD clock reads mm:ss.
  const clockSeconds = async () => {
    const [minutes, seconds] = (await page.locator(".hud-clock-time").innerText())
      .trim()
      .split(":")
      .map(Number);
    return minutes * 60 + seconds;
  };
  // Let the run get going so a reset would be visible.
  await expect.poll(clockSeconds, { timeout: 20_000 }).toBeGreaterThanOrEqual(3);
  const clockBefore = await clockSeconds();
  const adapterRequestsBefore = await readAdapterRequests();

  // The camera opens over the district, so the viewport centre is buildable ground.
  const canvas = page.getByTestId("viewport-canvas");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await canvas.click({ position: { x: box!.width * 0.5, y: box!.height * 0.5 } });
  await expect(undo).toBeEnabled({ timeout: 5_000 });

  // ADR-0007: same world and seed, so the geometry is swapped into the running
  // engine. The clock carries on instead of starting again from zero.
  await page.waitForTimeout(1_500);
  expect(await clockSeconds()).toBeGreaterThanOrEqual(clockBefore);
  await expect(simToggle).toHaveAttribute("aria-label", /Pause|暂停/);

  await undo.click();
  await expect(undo).toBeDisabled();

  // Building swaps scene geometry, not the renderer: placing and undoing must
  // not rebuild the GPU device, re-run the benchmark or regenerate the city.
  await page.waitForTimeout(1_000);
  expect(await readAdapterRequests()).toBe(adapterRequestsBefore);
  expect(errors.messages).toEqual([]);
});

/**
 * Layout guard at a common laptop size. Each assertion is a bug that shipped:
 * the editor SVG kept a 5:3 box inside a clipping wrapper, so the lower half of
 * the plan could not be seen or clicked; the analytics window opened over the
 * heatmap window buttons; the tools window opened over the build toolbar and
 * ran off the bottom of the screen.
 */
test("edit canvas shows the whole plan and HUD windows cover no controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await enterWorkbench(page);

  await page.getByTestId("stage-tab-edit").click();
  const editor = await page.evaluate(() => {
    const box = (selector: string) =>
      document.querySelector(selector)!.getBoundingClientRect();
    const canvas = box('[data-testid="editor-canvas"]');
    const wrap = box(".editor-canvas-wrap");
    const param = box(".editor-param-panel");
    return {
      canvasInsideWrap: canvas.top >= wrap.top - 1 && canvas.bottom <= wrap.bottom + 1,
      paramBelowCanvas: param.top >= canvas.bottom - 1,
      onScreen: canvas.bottom <= window.innerHeight,
    };
  });
  expect(editor).toEqual({
    canvasInsideWrap: true,
    onScreen: true,
    paramBelowCanvas: true,
  });

  await page.getByTestId("view-mode-3d").click();
  await page.getByTestId("palette-layer-heatmap").click();
  await page.getByTestId("info-window-analytics").click();
  await page.getByTestId("info-window-tools").click();

  const covered = await page.evaluate(() => {
    const blocked = (selector: string) =>
      [...document.querySelectorAll<HTMLElement>(selector)].filter((element) => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return !(hit === element || element.contains(hit));
      }).length;
    const offBottom = [...document.querySelectorAll(".hud-window")].filter(
      (element) => element.getBoundingClientRect().bottom > window.innerHeight,
    ).length;
    return {
      heatmapOptions: blocked(".hud-layer-options button"),
      toolbar: blocked(".hud-toolbar button"),
      windowsOffScreen: offBottom,
    };
  });
  expect(covered).toEqual({ heatmapOptions: 0, toolbar: 0, windowsOffScreen: 0 });
});
