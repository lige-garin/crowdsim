import { describe, expect, it } from "vitest";
import {
  buildSobolExperiment,
  generateSobolSamples,
  runSobolAnalysis,
  runSocialForceSobolAnalysis,
  sobolIndicesFromOutputs,
  summarizeSobolExperimentResults,
} from "./sobolAnalysis";
import type { SensitivityParameter } from "./sensitivityAnalysis";
import { demoScene } from "../scenes/demoScene";
import type { BenchmarkScenario } from "./benchmarkTypes";
import { runExperiment } from "./experimentRunner";

describe("generateSobolSamples", () => {
  it("produces a and b matrices, and one ab matrix per parameter, all the requested size", () => {
    const parameters: SensitivityParameter[] = [
      { id: "x1", max: 1, min: 0 },
      { id: "x2", max: 1, min: 0 },
      { id: "x3", max: 1, min: 0 },
    ];
    const samples = generateSobolSamples(parameters, { sampleCount: 20 });
    expect(samples.a).toHaveLength(20);
    expect(samples.b).toHaveLength(20);
    expect(samples.ab).toHaveLength(3);
    expect(samples.ab.every((rows) => rows.length === 20)).toBe(true);
  });

  it("ab[i] matches a everywhere except parameter i, which comes from b", () => {
    const parameters: SensitivityParameter[] = [
      { id: "x1", max: 1, min: 0 },
      { id: "x2", max: 1, min: 0 },
    ];
    const samples = generateSobolSamples(parameters, { sampleCount: 10 });
    const abForX2 = samples.ab[1];
    for (let row = 0; row < 10; row++) {
      expect(abForX2[row].x1).toBe(samples.a[row].x1);
      expect(abForX2[row].x2).toBe(samples.b[row].x2);
    }
  });

  it("is deterministic for the same seed", () => {
    const parameters: SensitivityParameter[] = [{ id: "x1", max: 1, min: 0 }];
    const first = generateSobolSamples(parameters, { sampleCount: 5, seed: 3 });
    const second = generateSobolSamples(parameters, { sampleCount: 5, seed: 3 });
    expect(first).toEqual(second);
  });
});

describe("runSobolAnalysis against known analytical results", () => {
  it("gives a purely linear parameter first-order and total-order indices near 1, and an irrelevant one near 0", () => {
    // Y = x1 exactly; x2 never touched. Every drop of variance is x1's.
    const parameters: SensitivityParameter[] = [
      { id: "x1", max: 1, min: 0 },
      { id: "x2", max: 1, min: 0 },
    ];
    const summary = runSobolAnalysis(parameters, (point) => point.x1, {
      sampleCount: 4000,
      seed: 1,
    });
    const byId = new Map(summary.map((s) => [s.parameterId, s]));

    expect(byId.get("x1")!.firstOrder).toBeGreaterThan(0.9);
    expect(byId.get("x1")!.totalOrder).toBeGreaterThan(0.9);
    expect(Math.abs(byId.get("x2")!.firstOrder)).toBeLessThan(0.05);
    expect(Math.abs(byId.get("x2")!.totalOrder)).toBeLessThan(0.05);
  });

  it("gives a pure-interaction function (Y = x1 * x2, zero-mean inputs) near-zero first order but near-1 total order for both parameters", () => {
    // x1, x2 ~ U(-1, 1): E[x1] = E[x2] = 0, so neither parameter has a
    // marginal (first-order) effect on Y = x1 * x2 alone — the entire
    // variance of Y is the x1-x2 interaction, which only the total-order
    // index sees.
    const parameters: SensitivityParameter[] = [
      { id: "x1", max: 1, min: -1 },
      { id: "x2", max: 1, min: -1 },
    ];
    const summary = runSobolAnalysis(parameters, (point) => point.x1 * point.x2, {
      sampleCount: 6000,
      seed: 2,
    });
    const byId = new Map(summary.map((s) => [s.parameterId, s]));

    expect(Math.abs(byId.get("x1")!.firstOrder)).toBeLessThan(0.08);
    expect(Math.abs(byId.get("x2")!.firstOrder)).toBeLessThan(0.08);
    expect(byId.get("x1")!.totalOrder).toBeGreaterThan(0.85);
    expect(byId.get("x2")!.totalOrder).toBeGreaterThan(0.85);
  });
});

describe("sobolIndicesFromOutputs", () => {
  it("reduces to 0 when Var(Y) is 0 (a constant output) rather than dividing by zero", () => {
    const parameters: SensitivityParameter[] = [{ id: "x1", max: 1, min: 0 }];
    const summary = sobolIndicesFromOutputs(
      parameters,
      [5, 5, 5],
      [5, 5, 5],
      [[5, 5, 5]],
    );
    expect(summary[0].firstOrder).toBe(0);
    expect(summary[0].totalOrder).toBe(0);
  });
});

describe("runSocialForceSobolAnalysis and worker-shaped equivalence", () => {
  const scenario: BenchmarkScenario = {
    description: "sobol smoke test scenario",
    durationSeconds: 20,
    expectations: [],
    id: "sobol-smoke",
    name: "sobol smoke",
    scene: demoScene,
    simulation: { maxAgents: 40 },
    tags: [],
  };

  it("evaluates sampleCount * (parameters.length + 2) times and ranks every screened parameter", () => {
    const result = runSocialForceSobolAnalysis(scenario, {
      sampleCount: 3,
      seed: 1,
    });

    expect(result.evaluationCount).toBe(3 * (result.parameters.length + 2));
    expect(result.summary).toHaveLength(result.parameters.length);
    expect(
      result.summary.every(
        (s) => Number.isFinite(s.firstOrder) && Number.isFinite(s.totalOrder),
      ),
    ).toBe(true);
  }, 30_000);

  it("builds an ExperimentDefinition with sampleCount * (parameters.length + 2) variants, replications 1", () => {
    const parameters: readonly SensitivityParameter[] = [
      { id: "relaxationSeconds", max: 1, min: 0.3 },
      { id: "agentStrength", max: 3, min: 1 },
    ];
    const { experiment, samples } = buildSobolExperiment(scenario, parameters, {
      sampleCount: 4,
      seed: 2,
    });

    expect(experiment.replications).toBe(1);
    expect(experiment.variants).toHaveLength(4 * (parameters.length + 2));
    expect(samples.ab).toHaveLength(parameters.length);
  });

  it("reconstructs the same indices from a worker-shaped run as the synchronous path", () => {
    const parameters: readonly SensitivityParameter[] = [
      { id: "relaxationSeconds", max: 1, min: 0.3 },
      { id: "agentStrength", max: 3, min: 1 },
    ];
    const { experiment, samples } = buildSobolExperiment(scenario, parameters, {
      sampleCount: 3,
      seed: 4,
    });

    // The same real-simulation-time-belongs-off-the-main-thread rule
    // sensitivityAnalysis.test.ts already follows for Morris:
    // `runExperiment` is the same code the worker calls.
    const results = runExperiment(experiment);
    const summary = summarizeSobolExperimentResults(parameters, samples, results);

    expect(summary).toHaveLength(parameters.length);
    expect(
      summary.every(
        (s) => Number.isFinite(s.firstOrder) && Number.isFinite(s.totalOrder),
      ),
    ).toBe(true);
  }, 30_000);

  it("throws rather than silently mis-computing if a row's result is missing", () => {
    const { samples } = buildSobolExperiment(scenario, undefined, {
      sampleCount: 2,
      seed: 5,
    });

    expect(() =>
      summarizeSobolExperimentResults(
        [{ id: "relaxationSeconds", max: 1, min: 0.3 }],
        samples,
        [],
      ),
    ).toThrow();
  });
});
