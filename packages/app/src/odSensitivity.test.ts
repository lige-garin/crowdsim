import { describe, expect, it } from "vitest";
import type { ODDestination, ODEntrance } from "./odEntryModel";
import { summarizeOdUncertainty } from "./odSensitivity";

const entrances: ODEntrance[] = [{ id: "e1", position: { x: 0, y: 0 }, inflow: 100 }];
const destinations: ODDestination[] = [
  { id: "near", position: { x: 10, y: 0 }, attraction: 1 },
  { id: "far", position: { x: 90, y: 0 }, attraction: 1 },
];

describe("summarizeOdUncertainty", () => {
  it("orders the band min <= p50 <= p95 <= max and keeps mean inside it", () => {
    const summary = summarizeOdUncertainty(entrances, destinations, [
      { distanceDecay: 0.02 },
      { distanceDecay: 0.05 },
      { distanceDecay: 0.1 },
      { distanceDecay: 0.2 },
    ]);
    for (const id of ["near", "far"]) {
      const band = summary.byDestination[id];
      expect(band.min).toBeLessThanOrEqual(band.p50);
      expect(band.p50).toBeLessThanOrEqual(band.p95);
      expect(band.p95).toBeLessThanOrEqual(band.max);
      expect(band.mean).toBeGreaterThanOrEqual(band.min);
      expect(band.mean).toBeLessThanOrEqual(band.max);
      expect(band.span).toBeCloseTo(band.max - band.min, 9);
    }
  });

  it("has zero span for a single sample", () => {
    const summary = summarizeOdUncertainty(entrances, destinations, [
      { distanceDecay: 0.1 },
    ]);
    expect(summary.sampleCount).toBe(1);
    expect(summary.byDestination.near.span).toBe(0);
    expect(summary.byDestination.near.min).toBe(summary.byDestination.near.max);
  });

  it("produces a non-zero band when decay sweeps move arrivals", () => {
    const summary = summarizeOdUncertainty(entrances, destinations, [
      { distanceDecay: 0.0 },
      { distanceDecay: 0.3 },
    ]);
    // higher decay shifts arrivals toward the near destination -> its share varies
    expect(summary.byDestination.near.span).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    const samples = [{ distanceDecay: 0.05 }, { distanceDecay: 0.15 }];
    expect(summarizeOdUncertainty(entrances, destinations, samples)).toEqual(
      summarizeOdUncertainty(entrances, destinations, samples),
    );
  });
});
