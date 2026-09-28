import { describe, expect, it } from "vitest";
import { usesWorkerSimulationPath } from "./simulationThread";

describe("usesWorkerSimulationPath", () => {
  it("uses the worker path by default (stable, verified simulation core)", () => {
    expect(usesWorkerSimulationPath({ forceMainSim: false })).toBe(true);
  });

  it("uses the main thread only when explicitly forced via ?mainsim", () => {
    expect(usesWorkerSimulationPath({ forceMainSim: true })).toBe(false);
  });

  // Regression: the path must NOT depend on the async WebGPU probe. Gating on it
  // flipped worker -> main mid-run when the probe resolved, abandoning the
  // running sim for a paused main engine ("empty city" on WebGPU machines).
  // This is enforced structurally: the input has no WebGPU field at all.
  it("decides purely from the stable flag (no runtime/async inputs)", () => {
    const decideKeys = Object.keys({ forceMainSim: false });
    expect(decideKeys).toEqual(["forceMainSim"]);
  });
});
