import { describe, expect, it } from "vitest";
import { selectAgentIntentOverlay } from "./simulationViewportOverlay";

describe("simulationViewportOverlay", () => {
  it("prioritizes live decision state for agent intent icons", () => {
    expect(
      selectAgentIntentOverlay({ id: 1, lifecycleState: "queue" }, { seed: 1 }),
    ).toMatchObject({ icon: "⌛", intent: "queue", label: "Queueing" });
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
});
