import { describe, expect, it } from "vitest";
import { defaultDemoScene } from "../scenes/defaultDemoScene";
import {
  selectAgentIntentOverlay,
  selectViewportAgentAnnotations,
} from "./simulationViewportOverlay";

describe("simulationViewportOverlay", () => {
  it("prioritizes live decision state for agent intent icons", () => {
    expect(
      selectAgentIntentOverlay({ id: 1, lifecycleState: "queue" }, { seed: 1 }),
    ).toMatchObject({ icon: "Q", intent: "queue", label: "Queueing" });
    expect(
      selectAgentIntentOverlay({ id: 2, lifecycleState: "evacuate" }, { seed: 1 }),
    ).toMatchObject({ icon: "!", intent: "evacuate" });
    expect(
      selectAgentIntentOverlay({ id: 3, selectedStoreId: "coffee-pulse" }, { seed: 1 }),
    ).toMatchObject({ icon: "$", intent: "browseFashion", label: "Shopping" });
  });

  it("falls back to deterministic persona intent icons", () => {
    const first = selectAgentIntentOverlay({ id: 12 }, { seed: 31 });
    const second = selectAgentIntentOverlay({ id: 12 }, { seed: 31 });

    expect(first).toEqual(second);
    expect(first.label.length).toBeGreaterThan(0);
  });

  it("projects agent annotations into the 3D viewport and caps marker count", () => {
    const annotations = selectViewportAgentAnnotations({
      scene: defaultDemoScene,
      snapshot: {
        agentCount: 180,
        agents: Array.from({ length: 180 }, (_, index) => ({
          id: index,
          lifecycleState: index === 0 ? "queue" : "walk",
          targetX: index,
          targetY: index,
          vx: 0,
          vy: 0,
          x: (index % 30) * 5,
          y: (index % 18) * 5,
        })),
        elapsedSeconds: 1200,
        exitedCount: 0,
        spawnedCount: 180,
        status: "running",
        stepCount: 1,
        timeScale: 1,
      },
      viewMode: "3d",
    });

    expect(annotations).toHaveLength(90);
    expect(annotations[0]).toMatchObject({
      icon: "Q",
      id: 0,
      intent: "queue",
    });
    expect(annotations.every((agent) => agent.leftPercent >= 4)).toBe(true);
    expect(annotations.every((agent) => agent.leftPercent <= 96)).toBe(true);
    expect(annotations.every((agent) => agent.topPercent >= 4)).toBe(true);
    expect(annotations.every((agent) => agent.topPercent <= 96)).toBe(true);
  });

  it("keeps top-down annotations aligned to scene coordinates", () => {
    const annotations = selectViewportAgentAnnotations({
      scene: defaultDemoScene,
      snapshot: {
        agentCount: 1,
        agents: [
          {
            id: 7,
            lifecycleState: "walk",
            targetX: 80,
            targetY: 48,
            vx: 0,
            vy: 0,
            x: 80,
            y: 48,
          },
        ],
        elapsedSeconds: 0,
        exitedCount: 0,
        spawnedCount: 1,
        status: "running",
        stepCount: 1,
        timeScale: 1,
      },
      viewMode: "2d",
    });

    expect(annotations).toHaveLength(1);
    expect(annotations[0]).toMatchObject({
      id: 7,
      leftPercent: 50,
      topPercent: 50,
    });
  });
});
