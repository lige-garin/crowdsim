import { expect, test, type Page } from "@playwright/test";

// The 2-core software-WebGL CI runner needs 3-5x the local time per
// operation, and rate-dependent waits (recording seconds, chart samples)
// accumulate at simulation speed — a fraction of wall-clock there. The
// per-test budgets and rate waits below take this floor on CI (measured:
// the panel-dock walk alone needs >240 s; it stays tuned for local runs).
const ciBudgetFloor = process.env.CI ? 480_000 : 0;

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
 *
 * Basic mode (`uiMode.ts`) is now the default landing state and has no
 * `.home-primary` button at all -- home is the template gallery instead. The
 * tests below exercise the classic expert-mode workbench (build tools, the
 * full HUD), so this switches to expert mode first via the mode toggle
 * (`.home-mode-toggle`). Basic mode's own path has its own e2e coverage,
 * "basic mode: template pick runs a simulation with the dashboard already
 * open," below.
 */
async function enterWorkbench(page: Page) {
  const modeToggle = page.locator("button.home-mode-toggle");
  await expect(modeToggle).toBeVisible();
  await modeToggle.click();

  const enter = page.locator("button.home-primary");
  await expect(enter).toBeVisible();
  await enter.click();
}

test("workbench boots into a running simulation and renders a crowd", async ({
  page,
}) => {
  // Inner waits already total up to ~75 s (engine start, canvas content,
  // live agents) — an outer budget of 30 s could never fit them on a slow
  // machine, and software-WebGL compat mode (the no-GPU condition) is slow.
  test.setTimeout(Math.max(90_000, ciBudgetFloor));
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
  // This walks every dock panel in sequence while the 3D viewport keeps
  // rendering; under software WebGL (the no-GPU CI/local condition, where the
  // compat mode honestly renders at a capped frame rate) that combination
  // legitimately takes longer than the default budget.
  test.setTimeout(Math.max(90_000, ciBudgetFloor));
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
   * squeezed the dock into a narrow sidebar track and left most chips inside
   * a scrollbar-less horizontal scroller. Reachable-by-Playwright is not
   * reachable-by-human; assert the human version.
   *
   * The panel count below was 13 as of 2026-09-24; batch B1 that same day
   * deleted three low-value panels (scale-readiness, scenario-comparison,
   * plus the two already-removed AI/tiles ones), bringing panelRegistry.tsx
   * down to 9. `scale-readiness` specifically no longer exists, so asserting
   * it below would fail every run -- both stale numbers are updated here
   * against the current panelRegistry.tsx rather than left to rot again.
   */
  const chips = page.locator('[data-testid^="panel-chip-"]');
  const chipCount = await chips.count();
  expect(chipCount).toBeGreaterThanOrEqual(9);

  for (let index = 0; index < chipCount; index += 1) {
    const chip = chips.nth(index);
    await expect(chip, `panel chip ${index} must be visible`).toBeVisible();
    await expect(chip, `panel chip ${index} must be on screen`).toBeInViewport({
      ratio: 1,
    });
  }

  for (const id of [
    "validation-report",
    "brand-intelligence",
    "sensitivity-screening",
  ]) {
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
 * Replay: the run is recorded as it goes; opening replay pauses it, scrubbing
 * puts that moment's crowd in the views, and play resumes the live run.
 */
test("replay pauses the run, scrubs the recording, and hands back to live", async ({
  page,
}) => {
  const errors = captureRuntimeErrors(page);
  await page.goto("/");
  await enterWorkbench(page);

  const simToggle = page.getByTestId("sim-toggle");
  const replayToggle = page.getByTestId("replay-toggle");
  // The button enables once the recorder holds enough simulated seconds —
  // on the slow CI runner those accumulate at a fraction of wall-clock.
  await expect(replayToggle).toBeEnabled({
    timeout: Math.max(20_000, ciBudgetFloor),
  });
  await page.waitForTimeout(4_000);

  await replayToggle.click();
  const replay = page.getByTestId("trajectory-replay");
  await expect(replay).toBeVisible();
  await expect(simToggle).toHaveAttribute("aria-label", /Start|开始/);

  const slider = replay.getByRole("slider");
  const endCount = Number.parseInt(
    (await page.getByTestId("replay-agent-count").textContent()) ?? "",
    10,
  );
  await slider.press("Home");
  const startCount = Number.parseInt(
    (await page.getByTestId("replay-agent-count").textContent()) ?? "",
    10,
  );
  expect(endCount).toBeGreaterThan(startCount);

  await simToggle.click();
  await expect(replay).toBeHidden();
  await expect(simToggle).toHaveAttribute("aria-label", /Pause|暂停/);

  // Closing the replay bar by its own close button (rather than pressing play)
  // has to hand the run back as well: it used to drop the bar and leave the
  // run stopped for good, because only the play button cleared the pause.
  await replayToggle.click();
  await expect(replay).toBeVisible();
  await expect(simToggle).toHaveAttribute("aria-label", /Start|开始/);
  await replay.getByRole("button", { name: /Back to live|回到实时/ }).click();
  await expect(replay).toBeHidden();
  await expect(simToggle).toHaveAttribute("aria-label", /Pause|暂停/);
  expect(errors.messages).toEqual([]);
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

  // Ask the page whether a GPU adapter can actually be had, rather than
  // watching for the unsupported card: requestAdapter() resolves on its own
  // schedule, so the card is often not on screen yet when a test looks for it.
  // With no adapter the viewport takes its fail-loud branch (ADR-0006) and the
  // card covers the canvas, so nothing in the city can be clicked. Giving the
  // runner a software adapter was tried and measured to be worse — with
  // SwiftShader flags five cases failed instead of one — so this path stays
  // covered by local runs and skips here, with the reason on the record.
  const gpuAdapterAvailable = await page.evaluate(async () => {
    const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu) return false;
    try {
      return Boolean(await gpu.requestAdapter());
    } catch {
      return false;
    }
  });
  test.skip(
    !gpuAdapterAvailable,
    "needs a GPU adapter: without one the viewport shows its unsupported card over the canvas",
  );

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

/**
 * The sweep runs off the main thread.
 *
 * It used to run synchronously while the app froze, and print the worker
 * request it never sent as a label. What this pins is the part that was
 * missing: the run happens in a worker, the page stays alive while it does,
 * and the result says how many runs are behind each number.
 */
test("the parameter sweep runs in a worker and reports an interval", async ({
  page,
}) => {
  const errors = captureRuntimeErrors(page);

  await page.goto("/");
  await enterWorkbench(page);

  // The panels live in a floating window opened from the info rail.
  await page.getByTestId("info-window-tools").click();
  await page.getByTestId("panel-chip-experiment-sweep").click();
  await expect(page.getByTestId("panel-dock-body")).toBeVisible();

  const clock = page.getByTestId("hud-agent-count");
  const before = await clock.innerText();

  await page.getByTestId("sweep-run").click();

  // The crowd keeps moving while the sweep runs: it is not on this thread.
  await expect
    .poll(async () => (await clock.innerText()) !== before, { timeout: 20_000 })
    .toBe(true);

  const firstResult = page.locator('[data-testid^="sweep-result-"]').first();

  await expect(firstResult).toBeVisible({ timeout: 60_000 });
  // Five runs per variant, so every line carries an interval and its count.
  await expect(firstResult).toContainText("95%");
  await expect(firstResult).toContainText("次");

  expect(errors.messages).toEqual([]);
});

/**
 * The golden path this batch of chart work was for: run the default scene,
 * open live analytics, and see real charts draw from the live crowd -- not
 * just the raw numbers the panel showed before this batch (B2). Each chart
 * added in this batch (RealtimeStrip.tsx, CountLineFlowChart.tsx,
 * JourneyTimeHistogram.tsx, PlacesRankingChart.tsx, HeatmapLegendOverlay in
 * SimulationViewportOverlays.tsx) has its own unit tests and was checked by
 * hand in a live dev server while it was built; this is the first assertion
 * that walks the whole chain end to end in a real browser, which unit tests
 * -- run against jsdom, with no real canvas 2D -- structurally cannot do.
 */
test("live analytics draws real charts for the running crowd, not just numbers", async ({
  page,
}) => {
  // The chart poll below already allows 60 s for shop visits and completed
  // journeys to accumulate at 4x speed — an inner budget that could never be
  // used under the default 30 s test timeout, and software-WebGL compat mode
  // (the no-GPU condition) stretches every step further.
  test.setTimeout(Math.max(120_000, ciBudgetFloor));
  const errors = captureRuntimeErrors(page);

  await page.goto("/");
  await enterWorkbench(page);

  await expect(page.getByTestId("sim-toggle")).toHaveAttribute(
    "aria-label",
    /Pause|暂停/,
    { timeout: 20_000 },
  );

  // Speed up: shop visits and completed journeys are what turn the
  // ranking bar and the journey-time histogram from empty into real charts,
  // and the default scene takes tens of seconds of simulated time to
  // accumulate either at 1x.
  await page.getByRole("button", { name: "4×" }).click();

  await page.getByTestId("info-window-analytics").click();
  await expect(page.getByTestId("hud-window-analytics")).toBeVisible();

  // The population strip draws from dashboardSamples as soon as the run has
  // sampled at all -- no crowd activity required, so this is checked first
  // as the fast, low-bar half of the assertion.
  const strip = page.getByTestId("realtime-strip");
  await expect(strip).toBeVisible();
  await expect(strip.locator("canvas")).toHaveCount(1);

  // The slower half: at least one of the count-line, journey-time, or
  // places-ranking charts (all built on the same EChart wrapper, all
  // .echart-container) must actually render once there is real data behind
  // it -- not stay permanently gated behind "nothing measured yet". The
  // data accumulates at simulation speed, a fraction of wall-clock on the
  // slow CI runner.
  await expect
    .poll(() => page.locator(".echart-container").count(), {
      timeout: Math.max(60_000, ciBudgetFloor),
    })
    .toBeGreaterThan(0);

  // The heatmap legend only draws once that layer is switched on -- it
  // should not appear before the toggle, and must appear after. The viewport
  // overlays require a working 3D renderer: when even WebGL is unavailable
  // (headless chromium without software GL), ADR-0006 replaces the viewport
  // with the readable blocking card and no legend can exist there — so that
  // branch asserts the card instead of the legend. Both branches stay real
  // assertions; neither silently skips.
  const webglAvailable = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  });
  if (webglAvailable) {
    await expect(page.locator(".render-heatmap-legend")).toHaveCount(0);
    await page.getByTestId("palette-layer-heatmap").click();
    await expect(page.locator(".render-heatmap-legend")).toBeVisible();
  } else {
    await expect(page.getByTestId("viewport-unsupported")).toBeVisible();
  }

  // The report: a live, scored check against the actual running scene, not
  // a fixture -- the last step of the plan's four-step normal-user path
  // ("select a template, run, watch the cockpit, get a report").
  await page.getByTestId("info-window-tools").click();
  await page.getByTestId("panel-chip-validation-report").click();
  await expect(page.getByTestId("panel-dock-body")).toBeVisible();

  expect(errors.messages).toEqual([]);
});

/**
 * Basic mode (`uiMode.ts`) is the app's new default landing state: the
 * four-step path this plan named ("select a template, run, watch the
 * cockpit, get a report") as its own literal UI, not merely reachable
 * through the classic expert-mode workbench once you know where to click.
 * Every other test in this file switches to expert mode first
 * (`enterWorkbench`'s mode-toggle click) specifically to keep testing that
 * classic path; this is the only one that walks basic mode itself, in a
 * real browser, end to end.
 */
test("basic mode: picking a template runs a simulation with the dashboard already open", async ({
  page,
}) => {
  const errors = captureRuntimeErrors(page);

  await page.goto("/");

  // Home is the template gallery by default -- no console/network buttons,
  // no mode toggle click needed to reach it.
  const firstCard = page.locator("button.template-card").first();
  await expect(firstCard).toBeVisible();
  await firstCard.click();

  // Step two (run) and step three (dashboard) happen without further
  // clicks: picking a template both loads the scene and opens the
  // dashboard, which a first-time user has no way to discover otherwise.
  await expect(page.getByTestId("sim-toggle")).toHaveAttribute(
    "aria-label",
    /Pause|暂停/,
    { timeout: 20_000 },
  );
  await expect(page.getByTestId("hud-window-analytics")).toBeVisible();

  // The build toolbar and info rail are expert-mode surfaces; neither
  // should exist in basic mode at all.
  await expect(page.getByLabel(/Build tools|建造工具/)).toHaveCount(0);
  await expect(page.getByLabel(/Info views|信息视图/)).toHaveCount(0);

  // Step four: one button opens the real report for the scene that is
  // actually running, not a trip through the tools window and panel dock.
  await page.getByTestId("hud-report-trigger").click();
  await expect(page.getByTestId("hud-window-report")).toBeVisible();

  expect(errors.messages).toEqual([]);
});
