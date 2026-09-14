import { describe, expect, it, vi } from "vitest";
import { createLiveCrowd } from "./liveCrowd";
import type { SimulationSnapshot } from "./simulationEngine";

const snapshot = (elapsedSeconds: number): SimulationSnapshot => ({
  agentCount: 0,
  agents: [],
  elapsedSeconds,
  exitedCount: 0,
  spawnedCount: 0,
  status: "running",
  stepCount: 0,
  timeScale: 1,
});

describe("createLiveCrowd", () => {
  it("hands out the latest frame and tells subscribers only when it changes", () => {
    const first = snapshot(0);
    const crowd = createLiveCrowd({ snapshot: first });
    const listener = vi.fn();
    const unsubscribe = crowd.subscribe(listener);

    crowd.set({ snapshot: first });
    expect(listener).not.toHaveBeenCalled();

    const next = snapshot(1);
    crowd.set({ snapshot: next });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(crowd.get().snapshot).toBe(next);

    unsubscribe();
    crowd.set({ snapshot: snapshot(2) });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
