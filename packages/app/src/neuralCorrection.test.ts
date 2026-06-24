import { describe, expect, it } from "vitest";
import { rimeaCoreScenarios } from "./benchmarkScenarios";
import { runBenchmarkScenario } from "./benchmarkRunner";
import {
  applyNeuralCorrectionToSpeed,
  createDefaultNeuralCorrectionModel,
  createNeuralCorrectionFeatures,
  createNeuralCorrectionRecommendation,
  inferNeuralResidualCorrection,
} from "./neuralCorrection";

describe("neural correction", () => {
  it("creates bounded speed and throughput multipliers", () => {
    const result = runBenchmarkScenario(rimeaCoreScenarios[0]);
    const recommendation = createNeuralCorrectionRecommendation(result, {
      targetMeanSpeedMetersPerSecond: result.meanSpeedMetersPerSecond * 1.1,
      targetThroughputPerMinute: result.throughputPerMinute * 0.9,
    });

    expect(recommendation.scenarioId).toBe("rimea-straight-corridor");
    expect(recommendation.speedMultiplier).toBeCloseTo(1.1);
    expect(recommendation.throughputMultiplier).toBeCloseTo(0.9);
    expect(recommendation.confidence).toBeGreaterThan(0.8);
    expect(recommendation.modelApplied).toBe(false);
    expect(recommendation.notes[0]).toContain("Heuristic residual inference path");
  });

  it("applies recommendations without mutating the benchmark result", () => {
    const result = runBenchmarkScenario(rimeaCoreScenarios[0]);
    const recommendation = createNeuralCorrectionRecommendation(result, {
      targetMeanSpeedMetersPerSecond: 99,
      targetThroughputPerMinute: 1,
    });

    expect(recommendation.speedMultiplier).toBe(1.5);
    expect(recommendation.throughputMultiplier).toBe(0.5);
    expect(applyNeuralCorrectionToSpeed(1.2, recommendation)).toBe(1.8);
  });

  it("runs a bounded auditable residual path when explicitly enabled", () => {
    const result = runBenchmarkScenario(rimeaCoreScenarios[0]);
    const target = {
      targetMeanSpeedMetersPerSecond: result.meanSpeedMetersPerSecond * 1.05,
      targetThroughputPerMinute: result.throughputPerMinute * 1.1,
    };
    const features = createNeuralCorrectionFeatures(result, target);
    const residual = inferNeuralResidualCorrection(
      features,
      createDefaultNeuralCorrectionModel(),
    );
    const recommendation = createNeuralCorrectionRecommendation(result, target, {
      model: createDefaultNeuralCorrectionModel(),
    });

    expect(Math.abs(residual.speedResidual)).toBeLessThanOrEqual(0.12);
    expect(Math.abs(residual.throughputResidual)).toBeLessThanOrEqual(0.12);
    expect(recommendation.modelApplied).toBe(true);
    expect(recommendation.notes[0]).toContain("Heuristic residual correction applied");
  });
});
