import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { describe, expect, it } from "vitest";
import { defaultDemoScene } from "./defaultDemoScene";
import { createSimulationEngineFromScene, hotUpdateBlocker } from "./simulationEngine";
import { reconcileAgentsWithScene } from "./simulationSceneReconcile";
import { placeInScene } from "./worldPlacement";

const scene = defaultDemoScene;

function runningEngine(steps: number, base: CrowdSimScene = scene) {
  const engine = createSimulationEngineFromScene(base);
  engine.start();
  engine.step(steps);
  return engine;
}

describe("hot scene update (ADR-0007)", () => {
  it("keeps the crowd, the clock and the counters", () => {
    const engine = runningEngine(1200);
    const before = engine.snapshot();
    expect(before.agentCount).toBeGreaterThan(0);

    const edited = placeInScene(scene, "building", { x: 40, y: 86 })!;
    const after = engine.updateScene!(edited);

    expect(after.elapsedSeconds).toBe(before.elapsedSeconds);
    expect(after.stepCount).toBe(before.stepCount);
    expect(after.spawnedCount).toBe(before.spawnedCount);
    expect(after.exitedCount).toBe(before.exitedCount);
    expect(after.agents.map((agent) => agent.id)).toEqual(
      before.agents.map((agent) => agent.id),
    );
    expect(after.status).toBe("running");

    // And it keeps running afterwards.
    expect(engine.step(60).stepCount).toBe(before.stepCount + 60);
  });

  it("sends a demolished shop's shoppers to the exit instead of freezing them", () => {
    const engine = runningEngine(3600);
    const shopper = engine
      .snapshot()
      .agents.find((agent) => agent.selectedStoreId !== undefined);
    expect(shopper, "a shopper committed to a shop by now").toBeDefined();
    const shopId = shopper!.selectedStoreId!;

    const withoutShop = { ...scene, shops: scene.shops.filter((s) => s.id !== shopId) };
    const after = engine.updateScene!(withoutShop);

    for (const agent of after.agents) {
      expect(agent.selectedStoreId).not.toBe(shopId);
    }
    const moved = after.agents.find((agent) => agent.id === shopper!.id)!;
    expect(moved.lifecycleState).toBe("leave");
    const sinkIds = scene.entrances.filter((e) => e.kind !== "source").map((e) => e.id);
    expect(sinkIds).toContain(moved.targetSinkId);
  }, 10_000);

  it("replays exactly: same seed, same edits at the same steps, same state", () => {
    const edited = placeInScene(scene, "shop", { x: 40, y: 86 })!;
    const run = () => {
      const engine = runningEngine(900);
      engine.updateScene!(edited);
      return engine.step(900);
    };
    expect(run()).toEqual(run());
  });

  it("refuses what it cannot swap, so the caller re-inits", () => {
    const engine = runningEngine(10);
    expect(() => engine.updateScene!({ ...scene, seed: scene.seed + 1 })).toThrow(
      /seed/,
    );
    expect(
      hotUpdateBlocker(scene, { ...scene, world: { width: 10, height: 10 } }),
    ).toMatch(/world/);
    expect(hotUpdateBlocker(scene, scene)).toBeNull();
  });

  it("treats a different scene with the same seed and world as a new run", () => {
    // Every stock scene shares the defaults, so seed + world alone let a loaded
    // or imported scene continue the old run's clock, charts and recording.
    expect(hotUpdateBlocker(scene, { ...scene, id: "another-scene" })).toMatch(
      /different scene/,
    );
  });

  it("refuses a scene with no exit instead of stranding the crowd", () => {
    const noExits = {
      ...scene,
      entrances: scene.entrances.filter((entrance) => entrance.kind === "source"),
    };
    expect(hotUpdateBlocker(scene, noExits)).toMatch(/no exit/);
  });

  it("re-routes checkout walkers when their counter is demolished", () => {
    const engine = runningEngine(5400);
    const payer = engine
      .snapshot()
      .agents.find((agent) => agent.lifecycleState === "checkout");
    if (!payer) {
      // The demo run must produce a buyer by now; if tuning changes that, this
      // spec needs a longer run rather than silently passing.
      throw new Error("no agent reached checkout in 5400 steps");
    }
    const after = engine.updateScene!({ ...scene, servicePoints: [] });
    const moved = after.agents.find((agent) => agent.id === payer.id)!;
    expect(moved.lifecycleState).toBe("leave");
    expect(scene.entrances.map((entrance) => entrance.id)).toContain(
      moved.targetSinkId,
    );
  }, 10_000);
});

describe("reconcileAgentsWithScene", () => {
  const sinkA = { id: "a", position: { x: 0, y: 0 }, radius: 1 };
  const sinkB = { id: "b", position: { x: 100, y: 0 }, radius: 1 };
  const counter = (x: number, y: number) => ({
    id: `c-${x}`,
    position: { x, y },
    radius: 2,
    serviceSeconds: 30,
  });
  const walker = {
    id: 1,
    x: 90,
    y: 0,
    vx: 0,
    vy: 0,
    targetX: 50,
    targetY: 50,
    targetSinkId: "gone",
    lifecycleState: "leave" as const,
  };
  const none = { servicePoints: [], shops: [] };

  it("retargets an agent whose exit was removed to the nearest remaining one", () => {
    const agents = reconcileAgentsWithScene([walker], {
      ...none,
      sinks: [sinkA, sinkB],
    });
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({ targetSinkId: "b", targetX: 100, targetY: 0 });
  });

  it("keeps a shopper's shop target when only its exit changed", () => {
    const shopper = {
      ...walker,
      lifecycleState: "walk" as const,
      selectedStoreId: "s1",
    };
    const shop = {
      id: "s1",
      position: { x: 50, y: 50 },
      radius: 2,
      attraction: 1,
      dwellSeconds: 10,
      capacity: 5,
      queuePosition: { x: 50, y: 50 },
      conversionRate: 0.2,
    };
    const agents = reconcileAgentsWithScene([shopper], {
      servicePoints: [],
      shops: [shop],
      sinks: [sinkA],
    });
    expect(agents[0]).toMatchObject({ targetSinkId: "a", targetX: 50, targetY: 50 });
  });

  it("sends a checkout walker to the counter that is left", () => {
    const payer = {
      ...walker,
      lifecycleState: "checkout" as const,
      servicePointId: "c-10",
      targetSinkId: "a",
      targetX: 10,
      targetY: 10,
    };
    const agents = reconcileAgentsWithScene([payer], {
      servicePoints: [counter(80, 0), counter(20, 60)],
      shops: [],
      sinks: [sinkA],
    });
    expect(agents[0]).toMatchObject({
      lifecycleState: "checkout",
      targetX: 80,
      targetY: 0,
    });
  });

  it("sends a checkout walker home when no counter is left", () => {
    const payer = {
      ...walker,
      lifecycleState: "checkout" as const,
      servicePointId: "c-10",
      targetSinkId: "a",
    };
    const agents = reconcileAgentsWithScene([payer], { ...none, sinks: [sinkA] });
    expect(agents[0]).toMatchObject({
      lifecycleState: "leave",
      targetX: 0,
      targetY: 0,
    });
  });

  it("leaves a checkout walker alone while its counter still stands", () => {
    const payer = {
      ...walker,
      lifecycleState: "checkout" as const,
      servicePointId: "c-80",
      targetSinkId: "a",
      targetX: 80,
      targetY: 0,
    };
    const agents = reconcileAgentsWithScene([payer], {
      servicePoints: [counter(80, 0)],
      shops: [],
      sinks: [sinkA],
    });
    expect(agents[0]).toBe(payer);
  });

  it("drops agents stranded with no exit, rather than counting them as exits", () => {
    const agents = reconcileAgentsWithScene([walker], {
      ...none,
      sinks: [],
    });
    expect(agents).toHaveLength(0);
  });

  it("leaves untouched agents as the same objects", () => {
    const fine = { ...walker, targetSinkId: "a" };
    const agents = reconcileAgentsWithScene([fine], { ...none, sinks: [sinkA] });
    expect(agents[0]).toBe(fine);
  });
});
