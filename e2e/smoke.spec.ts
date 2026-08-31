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

  const controls = page.getByRole("region", { name: /Simulation controls|仿真控制/ });
  await expect(controls).toBeVisible();

  // The workbench auto-starts; the toggle flipping to Pause proves the engine
  // actually reached `running` rather than merely rendering a Start button.
  await expect(controls.getByTestId("sim-toggle")).toHaveText(/Pause|暂停/, {
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
  // same snapshot as the 3D viewport.
  await expect
    .poll(() => page.locator(".editor-live-agent").count(), { timeout: 30_000 })
    .toBeGreaterThan(0);

  await controls.getByTestId("sim-toggle").click();
  await expect(controls.getByTestId("sim-toggle")).toHaveText(/Start|开始/);

  expect(errors.messages).toEqual([]);
});

test("viewport initialises the GPU once, not once per simulated second", async ({
  page,
}) => {
  // Regression guard for the scene-rebuild loop: the viewport effect used to
  // depend on `heatmapCells` and the 5s visual clock, so it tore down and
  // rebuilt the renderer — including `requestAdapter`/`requestDevice` and a
  // blocking 45-frame benchmark — roughly once per simulated second, leaking a
  // GPUDevice each time. Counting adapter requests is the cheapest way to see
  // that from the outside, and it works whether or not the machine has WebGPU.
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

  await page.goto("/");
  await enterWorkbench(page);

  const controls = page.getByRole("region", { name: /Simulation controls|仿真控制/ });
  await expect(controls.getByTestId("sim-toggle")).toHaveText(/Pause|暂停/, {
    timeout: 20_000,
  });

  const readRequests = () =>
    page.evaluate(
      () =>
        (window as typeof window & { __gpuAdapterRequests?: number })
          .__gpuAdapterRequests ?? 0,
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

  const canvas = page.getByTestId("editor-canvas");
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toBeVisible();

  const countShops = () => page.locator("g.editor-shop").count();
  const before = await countShops();

  await page.getByTestId("editor-tool-shop").click();
  await expect(page.getByTestId("editor-tool-shop")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width * 0.35, box!.y + box!.height * 0.55);

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

  const dock = page.getByRole("region", { name: /Tool panels|工具面板/ });
  await dock.scrollIntoViewIfNeeded();
  await expect(dock).toBeVisible();

  for (const id of ["validation-report", "brand-intelligence", "scale-readiness"]) {
    const chip = page.getByTestId(`panel-chip-${id}`);
    await chip.click();
    await expect(page.getByTestId("panel-dock-body")).toBeVisible();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
  }

  expect(errors.messages).toEqual([]);
});
