import { describe, expect, it } from "vitest";
import { crowdBudget, crowdOverlaySelection } from "./crowdBudget";
import { viewportAgentCapacity } from "../viewport/renderBenchmark";

/**
 * These are the relationships that have to hold between the four places that
 * used to cap the crowd independently. Nothing enforced them, so raising one
 * without the others produced a viewport that disagreed with the number printed
 * beside it — the exact defect this project already fixed once, when the 3D
 * view drew 240 agents while the HUD reported 1,800.
 */
describe("crowd budget", () => {
  it("can carry every agent the engine is allowed to spawn", () => {
    expect(
      crowdBudget.sharedCapacity,
      "the worker overlay would truncate the crowd before it reached the UI",
    ).toBeGreaterThanOrEqual(crowdBudget.maxAgents);

    expect(
      crowdBudget.renderCapacity,
      "the instanced viewport would silently clip the crowd it draws",
    ).toBeGreaterThanOrEqual(crowdBudget.maxAgents);
  });

  it("keeps the render capacity from ballooning past what can be spawned", () => {
    // Every frame writes matrices for allocated instances, so a capacity far
    // above the engine cap is pure per-frame cost for agents that cannot exist.
    expect(crowdBudget.renderCapacity).toBeLessThanOrEqual(crowdBudget.maxAgents * 8);
  });

  it("is the single source the render constant derives from", () => {
    expect(viewportAgentCapacity).toBe(crowdBudget.renderCapacity);
  });

  describe("2D overlay sampling", () => {
    it("reports honestly when it is showing everyone", () => {
      const selection = crowdOverlaySelection(120);

      expect(selection).toEqual({ drawn: 120, sampled: false, total: 120 });
    });

    it("reports honestly when it is showing a sample", () => {
      const selection = crowdOverlaySelection(crowdBudget.overlaySample + 1_500);

      expect(selection.drawn).toBe(crowdBudget.overlaySample);
      expect(selection.sampled).toBe(true);
      expect(selection.total).toBe(crowdBudget.overlaySample + 1_500);
    });

    it("does not go negative on an empty or nonsense crowd", () => {
      expect(crowdOverlaySelection(0)).toEqual({ drawn: 0, sampled: false, total: 0 });
      expect(crowdOverlaySelection(-5).drawn).toBe(0);
    });
  });
});
