import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoScene } from "./demoScene";
import { createSimulationWorkerClient } from "./simulationWorkerClient";
import { useRunScene } from "./useRunScene";
import { useSimulationWorkerController } from "./useSimulationWorkerController";

/** ADR-0007: an edit the engine can swap must not restart the run. */
describe("hot scene update through the worker controller", () => {
  let originalWorker: typeof Worker | undefined;
  let rafCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    originalWorker = globalThis.Worker;
    // No Worker in jsdom-land: the controller uses the inline client, which
    // runs the same engine and the same update path.
    Reflect.deleteProperty(globalThis, "Worker");
    rafCallbacks = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (originalWorker) {
      Object.defineProperty(globalThis, "Worker", {
        configurable: true,
        value: originalWorker,
      });
    }
    vi.restoreAllMocks();
  });

  async function runningController() {
    const hook = renderHook(
      ({ scene }: { scene: CrowdSimScene }) => useSimulationWorkerController(scene),
      { initialProps: { scene: demoScene } },
    );
    await waitFor(() => expect(hook.result.current.worker.status).toBe("ready"));
    act(() => hook.result.current.start());
    await waitFor(() => expect(hook.result.current.snapshot.status).toBe("running"));
    let now = 1_000;
    const advance = async () => {
      await act(async () => {
        for (let frame = 0; frame < 8; frame++) {
          now += 200;
          rafCallbacks.at(-1)?.(now);
          await Promise.resolve();
        }
      });
    };
    await advance();
    await waitFor(() =>
      expect(hook.result.current.snapshot.stepCount).toBeGreaterThan(0),
    );
    return { advance, hook };
  }

  it("keeps the clock running across a compatible edit", async () => {
    const { advance, hook } = await runningController();
    const before = hook.result.current.snapshot.stepCount;

    hook.rerender({ scene: { ...demoScene, name: "edited in place" } });
    await advance();

    await waitFor(() =>
      expect(hook.result.current.snapshot.stepCount).toBeGreaterThan(before),
    );
    expect(hook.result.current.snapshot.status).toBe("running");
    hook.unmount();
  });

  it("re-inits when the edit changes what a run is built from", async () => {
    const { hook } = await runningController();

    hook.rerender({ scene: { ...demoScene, seed: demoScene.seed + 1 } });

    await waitFor(() => expect(hook.result.current.snapshot.stepCount).toBe(0));
    expect(hook.result.current.snapshot.status).toBe("paused");
    hook.unmount();
  });

  it("ADR-0033 stage 3: reports movementBackend as real runtime state (cpu-compat via the inline no-Worker path), not a hardcoded label", async () => {
    const { hook } = await runningController();

    expect(hook.result.current.movementBackend).toEqual({
      active: "cpu-compat",
      message: expect.any(String),
    });
    hook.unmount();
  });
});

describe("useRunScene", () => {
  it("holds the run scene across compatible edits and moves on incompatible ones", () => {
    const hook = renderHook(
      ({ scene }: { scene: CrowdSimScene }) => useRunScene(scene),
      {
        initialProps: { scene: demoScene },
      },
    );
    hook.rerender({ scene: { ...demoScene, shops: [] } });
    expect(hook.result.current.runScene).toBe(demoScene);

    const reseeded = { ...demoScene, seed: demoScene.seed + 1 };
    hook.rerender({ scene: reseeded });
    expect(hook.result.current.runScene).toBe(reseeded);
  });

  it("moves on when the engine refused a hot update", () => {
    const hook = renderHook(
      ({ scene }: { scene: CrowdSimScene }) => useRunScene(scene),
      {
        initialProps: { scene: demoScene },
      },
    );
    const edited = { ...demoScene, shops: [] };
    hook.rerender({ scene: edited });
    act(() => hook.result.current.reinit(edited));
    expect(hook.result.current.runScene).toBe(edited);
  });
});

describe("inline client update-scene", () => {
  it("swaps geometry and keeps the run; refuses an incompatible scene", async () => {
    const client = createSimulationWorkerClient({ workerFactory: null });
    await client.init(demoScene);
    await client.start();
    for (let i = 0; i < 20; i++) await client.tick(0.1);
    const before = await client.snapshot();

    const after = await client.updateScene({ ...demoScene, shops: [] });
    expect(after.stepCount).toBe(before.stepCount);
    expect(after.agents.map((agent) => agent.id)).toEqual(
      before.agents.map((agent) => agent.id),
    );

    await expect(
      client.updateScene({ ...demoScene, seed: demoScene.seed + 1 }),
    ).rejects.toThrow(/refused/);
    client.dispose();
  });
});
