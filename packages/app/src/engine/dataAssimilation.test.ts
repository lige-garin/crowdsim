import { describe, expect, it } from "vitest";
import {
  createAssimilationRandom,
  createEnkfEnsemble,
  enkfMean,
  enkfSpread,
  enkfUpdate,
} from "./dataAssimilation";

describe("createEnkfEnsemble", () => {
  it("seeds members spread around the prior mean", () => {
    const random = createAssimilationRandom(1);
    const ensemble = createEnkfEnsemble(100, 10, 40, random);
    expect(ensemble.members).toHaveLength(40);
    expect(enkfMean(ensemble)).toBeGreaterThan(80);
    expect(enkfMean(ensemble)).toBeLessThan(120);
    expect(enkfSpread(ensemble)).toBeGreaterThan(0);
  });

  it("never produces a negative rate, however wide the spread", () => {
    const random = createAssimilationRandom(2);
    const ensemble = createEnkfEnsemble(5, 50, 200, random);
    expect(ensemble.members.every((member) => member >= 0)).toBe(true);
  });

  it("is deterministic for the same seed", () => {
    const a = createEnkfEnsemble(100, 10, 20, createAssimilationRandom(7));
    const b = createEnkfEnsemble(100, 10, 20, createAssimilationRandom(7));
    expect(a.members).toEqual(b.members);
  });
});

describe("enkfUpdate", () => {
  it("moves the ensemble mean toward a repeated real observation", () => {
    const random = createAssimilationRandom(3);
    let ensemble = createEnkfEnsemble(100, 20, 50, random);
    // A real count line reads 60/min consistently; the filter should walk
    // its estimate toward that, away from the scene author's guess of 100.
    for (let i = 0; i < 20; i++) {
      ensemble = enkfUpdate(ensemble, 60, 5, random);
    }
    expect(enkfMean(ensemble)).toBeGreaterThan(50);
    expect(enkfMean(ensemble)).toBeLessThan(70);
  });

  it("shrinks ensemble spread as repeated observations accumulate confidence", () => {
    const random = createAssimilationRandom(4);
    let ensemble = createEnkfEnsemble(100, 30, 50, random);
    const initialSpread = enkfSpread(ensemble);
    for (let i = 0; i < 15; i++) {
      ensemble = enkfUpdate(ensemble, 80, 3, random);
    }
    expect(enkfSpread(ensemble)).toBeLessThan(initialSpread);
  });

  it("barely moves the estimate when the observation is very uncertain (large observation noise)", () => {
    const random = createAssimilationRandom(5);
    const ensemble = createEnkfEnsemble(100, 5, 50, random);
    const before = enkfMean(ensemble);
    // Observation noise std enormous relative to the forecast spread: the
    // Kalman gain should be close to 0, so the update barely moves anything.
    const updated = enkfUpdate(ensemble, 10, 10_000, random);
    expect(Math.abs(enkfMean(updated) - before)).toBeLessThan(1);
  });

  it("clamps every member at 0, never a negative rate", () => {
    const random = createAssimilationRandom(6);
    const ensemble = createEnkfEnsemble(5, 1, 30, random);
    const updated = enkfUpdate(ensemble, 0, 0.5, random);
    expect(updated.members.every((member) => member >= 0)).toBe(true);
  });
});
