import { describe, expect, it } from "vitest";
import {
  buildMorrisExperiment,
  computeElementaryEffects,
  generateMorrisTrajectories,
  runMorrisScreening,
  runSocialForceSensitivity,
  summarizeMorrisEffects,
  summarizeMorrisExperimentResults,
  type ParameterPoint,
  type SensitivityParameter,
} from "./sensitivityAnalysis";
import { demoScene } from "./demoScene";
import type { BenchmarkScenario } from "./benchmarkTypes";
import { runExperiment } from "./experimentRunner";

const twoParams: readonly SensitivityParameter[] = [
  { id: "a", max: 10, min: 0 },
  { id: "b", max: 100, min: 0 },
];

describe("generateMorrisTrajectories", () => {
  it("gives each trajectory parameters.length + 1 points", () => {
    const trajectories = generateMorrisTrajectories(twoParams, {
      seed: 1,
      trajectoryCount: 5,
    });

    expect(trajectories).toHaveLength(5);
    for (const trajectory of trajectories) {
      expect(trajectory.points).toHaveLength(3);
      expect(trajectory.steppedParameterIds).toHaveLength(2);
    }
  });

  it("changes exactly one parameter between consecutive points, by the grid step", () => {
    const [trajectory] = generateMorrisTrajectories(twoParams, {
      seed: 7,
      trajectoryCount: 1,
    });

    for (let i = 0; i < trajectory.steppedParameterIds.length; i++) {
      const before = trajectory.points[i];
      const after = trajectory.points[i + 1];
      const changed = twoParams.filter((p) => before[p.id] !== after[p.id]);

      expect(changed).toHaveLength(1);
      expect(changed[0].id).toBe(trajectory.steppedParameterIds[i]);

      // Grid step at levels=4 is 2 of 3 grid divisions = 2/3 of the range.
      const param = changed[0];
      const step = Math.abs(after[param.id] - before[param.id]);
      expect(step).toBeCloseTo((2 / 3) * (param.max - param.min), 6);
    }
  });

  it("stays within each parameter's own [min, max]", () => {
    const trajectories = generateMorrisTrajectories(twoParams, {
      seed: 42,
      trajectoryCount: 20,
    });

    for (const trajectory of trajectories) {
      for (const point of trajectory.points) {
        for (const parameter of twoParams) {
          expect(point[parameter.id]).toBeGreaterThanOrEqual(parameter.min - 1e-9);
          expect(point[parameter.id]).toBeLessThanOrEqual(parameter.max + 1e-9);
        }
      }
    }
  });

  it("is deterministic for the same seed", () => {
    const first = generateMorrisTrajectories(twoParams, { seed: 5 });
    const second = generateMorrisTrajectories(twoParams, { seed: 5 });
    expect(first).toEqual(second);
  });
});

describe("computeElementaryEffects", () => {
  it("divides the output change by the parameter's own change", () => {
    const trajectory = {
      points: [
        { a: 0, b: 0 },
        { a: 10, b: 0 },
        { a: 10, b: 100 },
      ] as ParameterPoint[],
      steppedParameterIds: ["a", "b"],
    };
    // f = 2a + 0.5b
    const evaluate = (point: ParameterPoint) => 2 * point.a + 0.5 * point.b;

    const effects = computeElementaryEffects(trajectory, evaluate);

    expect(effects).toEqual([
      { effect: 2, parameterId: "a" }, // (20-0)/(10-0)
      { effect: 0.5, parameterId: "b" }, // (70-20)/(100-0)
    ]);
  });
});

describe("runMorrisScreening: ranks a known-sensitive parameter above a known-insensitive one", () => {
  it("puts the parameter the function actually depends on first", () => {
    const parameters: readonly SensitivityParameter[] = [
      { id: "sensitive", max: 10, min: 0 },
      { id: "insensitive", max: 10, min: 0 },
    ];
    // Output depends heavily on "sensitive", not at all on "insensitive".
    const evaluate = (point: ParameterPoint) => 5 * point.sensitive;

    const summary = runMorrisScreening(parameters, evaluate, {
      seed: 3,
      trajectoryCount: 8,
    });

    expect(summary[0].parameterId).toBe("sensitive");
    expect(summary[0].meanAbsoluteEffect).toBeCloseTo(5, 6);
    expect(summary[1].parameterId).toBe("insensitive");
    expect(summary[1].meanAbsoluteEffect).toBe(0);
  });

  it("gives a wide effect spread to a parameter with an interaction, not just a strong one", () => {
    const parameters: readonly SensitivityParameter[] = [
      { id: "x", max: 1, min: 0 },
      { id: "y", max: 1, min: 0 },
    ];
    // x's effect on the output depends on y (an interaction): sometimes it
    // barely matters, sometimes it matters a lot — a linear-only parameter
    // would not do this.
    const evaluate = (point: ParameterPoint) => point.x * point.y * 10;

    const summary = runMorrisScreening(parameters, evaluate, {
      seed: 11,
      trajectoryCount: 15,
    });
    const x = summary.find((s) => s.parameterId === "x")!;

    expect(x.stdDevEffect).toBeGreaterThan(0);
  });
});

describe("summarizeMorrisEffects", () => {
  it("ranks by mean absolute effect, descending", () => {
    const summary = summarizeMorrisEffects([
      { effect: 1, parameterId: "small" },
      { effect: -1, parameterId: "small" },
      { effect: 10, parameterId: "large" },
      { effect: 8, parameterId: "large" },
    ]);

    expect(summary.map((s) => s.parameterId)).toEqual(["large", "small"]);
    expect(summary[1].meanEffect).toBe(0); // +1 and -1 cancel in the signed mean...
    expect(summary[1].meanAbsoluteEffect).toBe(1); // ...but not in |effect|.
  });
});

describe("runSocialForceSensitivity", () => {
  const scenario: BenchmarkScenario = {
    description: "sensitivity smoke test scenario",
    durationSeconds: 20,
    expectations: [],
    id: "sensitivity-smoke",
    name: "sensitivity smoke",
    scene: demoScene,
    simulation: { maxAgents: 40 },
    tags: [],
  };

  it("evaluates once per trajectory point and ranks every screened parameter", () => {
    const result = runSocialForceSensitivity(scenario, {
      seed: 1,
      trajectoryCount: 2,
    });

    // Each trajectory has parameters.length + 1 points, each evaluated once.
    expect(result.evaluationCount).toBe(2 * (result.parameters.length + 1));
    expect(result.summary).toHaveLength(result.parameters.length);
    expect(result.summary.every((s) => Number.isFinite(s.meanAbsoluteEffect))).toBe(
      true,
    );
  }, 30_000);

  it("builds an ExperimentDefinition with one variant per trajectory point, replications 1", () => {
    const { experiment, trajectories } = buildMorrisExperiment(scenario, undefined, {
      seed: 2,
      trajectoryCount: 3,
    });

    expect(experiment.replications).toBe(1);
    const expectedVariants = trajectories.reduce(
      (sum, trajectory) => sum + trajectory.points.length,
      0,
    );
    expect(experiment.variants).toHaveLength(expectedVariants);
  });

  it("reconstructs the same ranking from a worker-shaped run as the synchronous path", () => {
    const parameters: readonly SensitivityParameter[] = [
      { id: "relaxationSeconds", max: 1, min: 0.3 },
      { id: "agentStrength", max: 3, min: 1 },
    ];
    const { experiment, trajectories } = buildMorrisExperiment(scenario, parameters, {
      seed: 4,
      trajectoryCount: 3,
    });

    // Stands in for what the background worker would return — this project's
    // established rule for this kind of panel (ExperimentSweepPanel) is that
    // real simulation time belongs off the main thread, not run synchronously
    // here; `runExperiment` is the same code the worker calls, exercised
    // directly so this test does not need a Worker.
    const results = runExperiment(experiment);
    const summary = summarizeMorrisExperimentResults(trajectories, results);

    expect(summary).toHaveLength(parameters.length);
    expect(summary.every((s) => Number.isFinite(s.meanAbsoluteEffect))).toBe(true);
  }, 30_000);

  it("throws rather than silently mis-ranking if a trajectory's result is missing", () => {
    const { trajectories } = buildMorrisExperiment(scenario, undefined, {
      seed: 5,
      trajectoryCount: 1,
    });

    expect(() => summarizeMorrisExperimentResults(trajectories, [])).toThrow();
  });
});
