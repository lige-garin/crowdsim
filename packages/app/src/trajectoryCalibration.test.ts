import { describe, expect, it } from "vitest";
import {
  buildCalibrationSamples,
  fitSocialForceToTrajectories,
  parseEthBiwiRows,
  predictedAcceleration,
  trajectoryAccelerationRmse,
  type EthRow,
} from "./trajectoryCalibration";

describe("parseEthBiwiRows", () => {
  it("parses whitespace-separated frame/pedestrian/x/y rows", () => {
    const raw = "10\t1.0\t0.5\t1.2\n20\t1.0\t0.9\t1.3\n";
    const rows = parseEthBiwiRows(raw);

    expect(rows).toEqual([
      { frame: 10, pedestrianId: "1.0", x: 0.5, y: 1.2 },
      { frame: 20, pedestrianId: "1.0", x: 0.9, y: 1.3 },
    ]);
  });

  it("skips blank lines and rows that do not parse as numbers", () => {
    const raw = "10 1 0.5 1.2\n\n   \nnot a row\n20 1 0.9 1.3";
    const rows = parseEthBiwiRows(raw);

    expect(rows).toHaveLength(2);
  });
});

describe("buildCalibrationSamples", () => {
  it("gives a lone walker at constant velocity a desired velocity matching their own motion and ~zero observed acceleration", () => {
    // Straight line, constant speed, 10 frame units (0.4 s) apart, nobody else present.
    const rows: EthRow[] = [
      { frame: 0, pedestrianId: "a", x: 0, y: 0 },
      { frame: 10, pedestrianId: "a", x: 1, y: 0 },
      { frame: 20, pedestrianId: "a", x: 2, y: 0 },
    ];

    const samples = buildCalibrationSamples(rows);

    expect(samples).toHaveLength(1);
    const [sample] = samples;
    expect(sample.velocity.x).toBeCloseTo(2.5, 5); // 1 m / 0.4 s
    expect(sample.desiredVelocity.x).toBeCloseTo(2.5, 5);
    expect(sample.observedAcceleration.x).toBeCloseTo(0, 5);
    expect(sample.observedAcceleration.y).toBeCloseTo(0, 5);
    expect(sample.neighbors).toEqual([]);
  });

  it("only counts someone present at the exact same frame as a neighbour", () => {
    const rows: EthRow[] = [
      { frame: 0, pedestrianId: "a", x: 0, y: 0 },
      { frame: 10, pedestrianId: "a", x: 1, y: 0 },
      { frame: 20, pedestrianId: "a", x: 2, y: 0 },
      // "b" is only ever seen at frame 10, right where "a"'s one sample is.
      { frame: 10, pedestrianId: "b", x: 1, y: 0.5 },
    ];

    const samples = buildCalibrationSamples(rows);

    expect(samples).toHaveLength(1);
    expect(samples[0].neighbors).toEqual([{ position: { x: 1, y: 0.5 } }]);
  });

  it("drops tracks too short to have both a previous and next velocity", () => {
    const rows: EthRow[] = [
      { frame: 0, pedestrianId: "a", x: 0, y: 0 },
      { frame: 10, pedestrianId: "a", x: 1, y: 0 },
    ];

    expect(buildCalibrationSamples(rows)).toHaveLength(0);
  });
});

const noInteraction = {
  agentRangeMeters: 0.3,
  agentStrength: 2,
  anisotropy: 0.3,
  relaxationSeconds: 0.5,
};

describe("predictedAcceleration", () => {
  it("predicts zero acceleration for a lone walker already at their desired velocity", () => {
    const a = predictedAcceleration(
      {
        desiredVelocity: { x: 1.3, y: 0 },
        neighbors: [],
        position: { x: 0, y: 0 },
        velocity: { x: 1.3, y: 0 },
      },
      noInteraction,
    );

    expect(a.x).toBeCloseTo(0, 6);
    expect(a.y).toBeCloseTo(0, 6);
  });

  it("pulls toward the desired velocity when short of it, with no neighbours", () => {
    const a = predictedAcceleration(
      {
        desiredVelocity: { x: 1.3, y: 0 },
        neighbors: [],
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
      },
      noInteraction,
    );

    expect(a.x).toBeCloseTo(1.3 / noInteraction.relaxationSeconds, 6);
    expect(a.y).toBeCloseTo(0, 6);
  });

  it("pushes away from a close neighbour", () => {
    const a = predictedAcceleration(
      {
        desiredVelocity: { x: 0, y: 0 },
        neighbors: [{ position: { x: 0.3, y: 0 } }],
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
      },
      noInteraction,
    );

    // The neighbour is to the +x side, so the push is in -x.
    expect(a.x).toBeLessThan(0);
    expect(a.y).toBeCloseTo(0, 6);
  });

  it("ignores a neighbour past the interaction range", () => {
    const a = predictedAcceleration(
      {
        desiredVelocity: { x: 0, y: 0 },
        neighbors: [{ position: { x: 50, y: 0 } }],
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
      },
      noInteraction,
    );

    expect(a.x).toBeCloseTo(0, 6);
    expect(a.y).toBeCloseTo(0, 6);
  });
});

describe("trajectoryAccelerationRmse", () => {
  it("is zero for an empty sample set", () => {
    expect(trajectoryAccelerationRmse([], noInteraction)).toBe(0);
  });

  it("is zero when the prediction matches the observation exactly", () => {
    const samples = [
      {
        desiredVelocity: { x: 1, y: 0 },
        neighbors: [],
        observedAcceleration: { x: 0, y: 0 },
        position: { x: 0, y: 0 },
        velocity: { x: 1, y: 0 },
      },
    ];

    expect(trajectoryAccelerationRmse(samples, noInteraction)).toBeCloseTo(0, 6);
  });
});

describe("fitSocialForceToTrajectories", () => {
  it("runs and returns a finite RMSE and in-bounds parameters", () => {
    const rows: EthRow[] = [
      { frame: 0, pedestrianId: "a", x: 0, y: 0 },
      { frame: 10, pedestrianId: "a", x: 1, y: 0 },
      { frame: 20, pedestrianId: "a", x: 2, y: 0 },
      { frame: 0, pedestrianId: "b", x: 0, y: 3 },
      { frame: 10, pedestrianId: "b", x: -1, y: 3 },
      { frame: 20, pedestrianId: "b", x: -2, y: 3 },
    ];
    const samples = buildCalibrationSamples(rows);

    const result = fitSocialForceToTrajectories(samples, noInteraction, {
      maxEvaluations: 10,
    });

    expect(result.evaluations).toBeGreaterThanOrEqual(5);
    expect(Number.isFinite(result.rmse)).toBe(true);
    expect(result.parameters.agentStrength).toBeGreaterThan(0);
  });
});
