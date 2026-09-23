import { describe, expect, it } from "vitest";
import { rimeaCoreScenarios } from "./benchmarkScenarios";
import { runScenarioForDiff } from "./scenarioDiffRunner";

describe("runScenarioForDiff", () => {
  it("produces a real RunAnalyticsSummary from an actual headless run", () => {
    const scenario = rimeaCoreScenarios[0];
    const result = runScenarioForDiff(scenario);

    expect(result.id).toBe(scenario.id);
    expect(result.name).toBe(scenario.name);
    expect(result.summary.samples).toBeGreaterThan(0);
    expect(result.summary.journeys.count).toBeGreaterThan(0);
  });

  it("does not report evacuation clearance unless asked to evacuate", () => {
    const result = runScenarioForDiff(rimeaCoreScenarios[0]);
    expect(result.evacuationClearSeconds).toBeUndefined();
  });

  it("reports evacuation clearance when evacuate is requested", () => {
    const result = runScenarioForDiff(rimeaCoreScenarios[0], { evacuate: true });
    expect(result.evacuationClearSeconds).toBeGreaterThanOrEqual(0);
  });

  // Corridor scenario steps at 1/20 s over 90 s -- 1800 physics steps. A
  // once-per-simulated-second sample count (matching useRunSeries.ts) stays
  // near 90; sampling every physics step would be near 1800.
  it("samples once per simulated second, not once per physics step", () => {
    const scenario = rimeaCoreScenarios[0];
    const result = runScenarioForDiff(scenario);

    expect(result.summary.samples).toBeLessThanOrEqual(
      Math.ceil(scenario.durationSeconds) + 1,
    );
  });
});
