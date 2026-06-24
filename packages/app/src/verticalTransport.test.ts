import { describe, expect, it } from "vitest";
import {
  computeVerticalRouteCost,
  type VerticalConnector,
} from "./verticalTransport";

const escalator = (
  id: string,
  x: number,
  y: number,
  overrides: Partial<VerticalConnector> = {},
): VerticalConnector => ({
  id,
  position: { x, y },
  minLevel: 0,
  maxLevel: 3,
  type: "escalator",
  costPerLevel: 5,
  ...overrides,
});

describe("computeVerticalRouteCost", () => {
  it("returns horizontal distance with no connector for same-level trips", () => {
    const result = computeVerticalRouteCost(
      { position: { x: 0, y: 0 }, level: 1 },
      { position: { x: 3, y: 4 }, level: 1 },
      [escalator("c1", 10, 10)],
    );
    expect(result.cost).toBeCloseTo(5, 9); // hypot(3,4)
    expect(result.connectorId).toBeNull();
    expect(result.levelChange).toBe(0);
  });

  it("routes cross-level via the cheapest connector", () => {
    const result = computeVerticalRouteCost(
      { position: { x: 0, y: 0 }, level: 0 },
      { position: { x: 0, y: 0 }, level: 2 },
      [escalator("near", 10, 0), escalator("far", 100, 0)],
    );
    // near: 10 + 5*2 + 10 = 30; far: 100 + 10 + 100 = 210
    expect(result.connectorId).toBe("near");
    expect(result.cost).toBeCloseTo(30, 9);
    expect(result.levelChange).toBe(2);
  });

  it("prefers an escalator over higher-cost stairs", () => {
    const result = computeVerticalRouteCost(
      { position: { x: 0, y: 0 }, level: 0 },
      { position: { x: 0, y: 0 }, level: 1 },
      [
        escalator("esc", 10, 0, { costPerLevel: 5 }),
        escalator("stair", 10, 0, { type: "stairs", costPerLevel: 20 }),
      ],
    );
    expect(result.connectorId).toBe("esc");
  });

  it("excludes out-of-service connectors (e.g. escalatorOutage)", () => {
    const result = computeVerticalRouteCost(
      { position: { x: 0, y: 0 }, level: 0 },
      { position: { x: 0, y: 0 }, level: 1 },
      [
        escalator("broken", 5, 0, { outOfService: true }),
        escalator("ok", 40, 0),
      ],
    );
    expect(result.connectorId).toBe("ok");
  });

  it("ignores connectors that do not span both levels", () => {
    const result = computeVerticalRouteCost(
      { position: { x: 0, y: 0 }, level: 0 },
      { position: { x: 0, y: 0 }, level: 3 },
      [
        escalator("short", 5, 0, { minLevel: 0, maxLevel: 1 }),
        escalator("tall", 40, 0, { minLevel: 0, maxLevel: 3 }),
      ],
    );
    expect(result.connectorId).toBe("tall");
  });

  it("is unreachable when no in-service connector spans the levels", () => {
    const result = computeVerticalRouteCost(
      { position: { x: 0, y: 0 }, level: 0 },
      { position: { x: 0, y: 0 }, level: 2 },
      [escalator("broken", 5, 0, { outOfService: true })],
    );
    expect(result.cost).toBe(Number.POSITIVE_INFINITY);
    expect(result.connectorId).toBeNull();
  });
});
