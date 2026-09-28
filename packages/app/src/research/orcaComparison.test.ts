import { describe, expect, it } from "vitest";
import {
  measureBottleneckFlow,
  measureCorridorSpeedMoussaid,
  measureCorridorSpeedOrca,
  measurePassingDistance,
  runOrcaComparison,
} from "./orcaComparison";
import { measureCorridorSpeed } from "../analytics/fundamentalDiagramHarness";

describe("measureCorridorSpeedMoussaid", () => {
  it("gives a finite, positive speed at a modest density, slowing as density rises", () => {
    const sparse = measureCorridorSpeedMoussaid(0.5, {
      warmupSeconds: 3,
      measureSeconds: 3,
    });
    const dense = measureCorridorSpeedMoussaid(3, {
      warmupSeconds: 3,
      measureSeconds: 3,
    });

    expect(Number.isFinite(sparse)).toBe(true);
    expect(sparse).toBeGreaterThan(0);
    expect(dense).toBeLessThan(sparse);
  }, 30_000);
});

describe("measureCorridorSpeedOrca", () => {
  it("gives a finite, positive speed at a modest density", () => {
    const speed = measureCorridorSpeedOrca(1, { warmupSeconds: 2, measureSeconds: 2 });

    expect(Number.isFinite(speed)).toBe(true);
    expect(speed).toBeGreaterThan(0);
  });

  it("slows down as density rises, the qualitative shape any crowd model should show", () => {
    const sparse = measureCorridorSpeedOrca(0.5, {
      warmupSeconds: 3,
      measureSeconds: 3,
    });
    const dense = measureCorridorSpeedOrca(3, { warmupSeconds: 3, measureSeconds: 3 });

    expect(dense).toBeLessThan(sparse);
  }, 30_000);
});

describe("measureBottleneckFlow and measurePassingDistance", () => {
  it("report a positive specific flow through the gap under both step functions", () => {
    // Exercise the harness's own step-function contract directly against a
    // trivial "everyone walks straight at max speed, no avoidance" stepper,
    // rather than pulling in the full social-force or ORCA cost for this
    // shape check.
    const straightLine = (input: {
      agents: readonly {
        id: number;
        x: number;
        y: number;
        targetX: number;
        targetY: number;
        radius?: number;
        speedFactor?: number;
        vx: number;
        vy: number;
      }[];
      dtSeconds: number;
      meanSpeedMetersPerSecond: number;
    }) =>
      input.agents.map((agent) => {
        const dx = agent.targetX - agent.x;
        const dy = agent.targetY - agent.y;
        const d = Math.hypot(dx, dy) || 1;
        const speed = input.meanSpeedMetersPerSecond * (agent.speedFactor ?? 1);
        return {
          ...agent,
          x: agent.x + (dx / d) * speed * input.dtSeconds,
          y: agent.y + (dy / d) * speed * input.dtSeconds,
          vx: (dx / d) * speed,
          vy: (dy / d) * speed,
        };
      });

    const flow = measureBottleneckFlow(straightLine as never, {
      people: 40,
      warmupSeconds: 1,
      measureSeconds: 3,
    });

    expect(flow).toBeGreaterThan(0);

    const gap = measurePassingDistance(straightLine as never, 3);
    expect(Number.isFinite(gap)).toBe(true);
  });
});

describe("runOrcaComparison", () => {
  it("returns all three models' sides of all three benchmarks", () => {
    const result = runOrcaComparison([0.5, 2]);

    expect(result.fundamentalDiagram).toHaveLength(2);
    for (const point of result.fundamentalDiagram) {
      expect(point.socialForce).toBeGreaterThan(0);
      expect(point.orca).toBeGreaterThan(0);
      expect(point.moussaid).toBeGreaterThan(0);
    }
    expect(result.bottleneckSpecificFlow.socialForce).toBeGreaterThanOrEqual(0);
    expect(result.bottleneckSpecificFlow.orca).toBeGreaterThanOrEqual(0);
    expect(result.bottleneckSpecificFlow.moussaid).toBeGreaterThanOrEqual(0);
    expect(result.passingDistanceMeters.socialForce).toBeGreaterThan(0);
    expect(result.passingDistanceMeters.orca).toBeGreaterThan(0);
    expect(result.passingDistanceMeters.moussaid).toBeGreaterThan(0);
  }, 60_000);

  it("agrees with the unmodified fundamental-diagram harness on the social-force side", () => {
    // The comparison must not have accidentally forked social force's own
    // measurement: calling it directly and through `runOrcaComparison`
    // should give the exact same number for the same density.
    const direct = measureCorridorSpeed(1, {});
    const viaComparison = runOrcaComparison([1]).fundamentalDiagram[0].socialForce;

    expect(viaComparison).toBe(direct);
  }, 30_000);
});
