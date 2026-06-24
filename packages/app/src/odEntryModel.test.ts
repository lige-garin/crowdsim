import { describe, expect, it } from "vitest";
import {
  buildGravityOdAllocation,
  type ODDestination,
  type ODEntrance,
} from "./odEntryModel";

const entrance = (id: string, x: number, y: number, inflow: number, floor = 0): ODEntrance => ({
  id,
  position: { x, y },
  inflow,
  floor,
});
const dest = (id: string, x: number, y: number, attraction: number, floor = 0): ODDestination => ({
  id,
  position: { x, y },
  attraction,
  floor,
});

describe("buildGravityOdAllocation", () => {
  it("gives each entrance a distribution over destinations that sums to 1", () => {
    const result = buildGravityOdAllocation(
      [entrance("e1", 0, 0, 100)],
      [dest("a", 10, 0, 1), dest("b", 20, 0, 2), dest("c", 5, 5, 1.5)],
      { distanceDecay: 0.1 },
    );
    const rows = result.byEntrance.e1;
    const total = rows.reduce((sum, row) => sum + row.probability, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("reduces to attraction-share when distanceDecay is 0 (single floor)", () => {
    const result = buildGravityOdAllocation(
      [entrance("e1", 0, 0, 100)],
      [dest("a", 10, 0, 1), dest("b", 90, 0, 3)],
      { distanceDecay: 0 },
    );
    const byId = Object.fromEntries(
      result.byEntrance.e1.map((row) => [row.destinationId, row.probability]),
    );
    // attraction 1 vs 3 -> 0.25 vs 0.75 regardless of distance
    expect(byId.a).toBeCloseTo(0.25, 6);
    expect(byId.b).toBeCloseTo(0.75, 6);
  });

  it("favours the nearer destination when attractions are equal and decay > 0", () => {
    const result = buildGravityOdAllocation(
      [entrance("e1", 0, 0, 100)],
      [dest("near", 5, 0, 1), dest("far", 50, 0, 1)],
      { distanceDecay: 0.1 },
    );
    const byId = Object.fromEntries(
      result.byEntrance.e1.map((row) => [row.destinationId, row.probability]),
    );
    expect(byId.near).toBeGreaterThan(byId.far);
  });

  it("penalises cross-floor destinations via floorChangePenalty", () => {
    const sameFloor = buildGravityOdAllocation(
      [entrance("e1", 0, 0, 100, 0)],
      [dest("same", 10, 0, 1, 0), dest("up", 10, 0, 1, 1)],
      { distanceDecay: 0.05, floorChangePenalty: 0 },
    );
    const withPenalty = buildGravityOdAllocation(
      [entrance("e1", 0, 0, 100, 0)],
      [dest("same", 10, 0, 1, 0), dest("up", 10, 0, 1, 1)],
      { distanceDecay: 0.05, floorChangePenalty: 30 },
    );
    const upSame = sameFloor.byEntrance.e1.find((r) => r.destinationId === "up")!;
    const upPenal = withPenalty.byEntrance.e1.find((r) => r.destinationId === "up")!;
    // identical geometry + attraction -> equal share without penalty
    expect(upSame.probability).toBeCloseTo(0.5, 6);
    // a floor change reduces the cross-floor share
    expect(upPenal.probability).toBeLessThan(0.5);
  });

  it("conserves flow: per-entrance expectedFlow sums to inflow, totals match", () => {
    const result = buildGravityOdAllocation(
      [entrance("e1", 0, 0, 60), entrance("e2", 100, 0, 40)],
      [dest("a", 10, 0, 1), dest("b", 90, 0, 1)],
      { distanceDecay: 0.05 },
    );
    const e1Flow = result.byEntrance.e1.reduce((s, r) => s + r.expectedFlow, 0);
    const e2Flow = result.byEntrance.e2.reduce((s, r) => s + r.expectedFlow, 0);
    expect(e1Flow).toBeCloseTo(60, 6);
    expect(e2Flow).toBeCloseTo(40, 6);
    expect(result.totalInflow).toBe(100);
    const arrivals = Object.values(result.destinationArrivals).reduce((s, v) => s + v, 0);
    expect(arrivals).toBeCloseTo(100, 6);
  });

  it("is deterministic", () => {
    const args = [
      [entrance("e1", 0, 0, 100)],
      [dest("a", 10, 0, 1), dest("b", 20, 0, 2)],
      { distanceDecay: 0.1 },
    ] as const;
    const a = buildGravityOdAllocation(...args);
    const b = buildGravityOdAllocation(...args);
    expect(a).toEqual(b);
  });

  it("falls back to a uniform split when all attractions are zero", () => {
    const result = buildGravityOdAllocation(
      [entrance("e1", 0, 0, 100)],
      [dest("a", 10, 0, 0), dest("b", 20, 0, 0)],
      { distanceDecay: 0.1 },
    );
    const byId = Object.fromEntries(
      result.byEntrance.e1.map((row) => [row.destinationId, row.probability]),
    );
    expect(byId.a).toBeCloseTo(0.5, 6);
    expect(byId.b).toBeCloseTo(0.5, 6);
  });
});
