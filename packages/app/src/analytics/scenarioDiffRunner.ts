import { createSimulationEngineFromScene } from "../engine/simulationEngine";
import { createRunAnalytics } from "./runAnalytics";
import type { BenchmarkScenario } from "./benchmarkTypes";
import type { ScenarioRunSnapshot } from "./scenarioDiffReport";

/**
 * Steps a `BenchmarkScenario` headlessly and produces the same
 * `RunAnalyticsSummary` the live "实测" panel shows for an interactive run
 * (`useRunSeries.ts`), so `scenarioDiffReport.ts` — which only ever consumed
 * hand-built snapshots in its own tests — can compare two scenarios nobody
 * actually ran side by side.
 *
 * Sampling matches `useRunSeries.ts`: once per simulated second, not once
 * per physics step. That module dedupes by `Math.floor(elapsedSeconds)` for
 * a live 250ms poll timer; here there is no timer, so the same dedup is
 * applied directly against the step loop. Recording every physics step
 * instead would over-sample by 20-60x relative to how every other summary
 * in this app is built, skewing minute-bucketed flow rates and stay
 * durations that assume roughly one sample per second.
 */
export type ScenarioDiffRunOptions = {
  /**
   * Raise the alarm at the start of the run, same effect as the live
   * evacuate button (`engine.setEvacuation(true)`). Applied identically to
   * both sides of a comparison — there is no scene-schema flag for "this
   * scenario is an evacuation," so the caller decides, once, for the pair.
   */
  evacuate?: boolean;
};

export function runScenarioForDiff(
  scenario: BenchmarkScenario,
  options: ScenarioDiffRunOptions = {},
): ScenarioRunSnapshot {
  const fixedDtSeconds = scenario.simulation.fixedDtSeconds ?? 1 / 60;
  const totalSteps = Math.ceil(scenario.durationSeconds / fixedDtSeconds);
  const engine = createSimulationEngineFromScene(scenario.scene, scenario.simulation);
  const analytics = createRunAnalytics();

  engine.start();
  if (options.evacuate) {
    engine.setEvacuation(true);
  }

  let snapshot = engine.snapshot();
  let lastSampledSecond = -1;
  const sample = () => {
    const second = Math.floor(snapshot.elapsedSeconds);
    if (second === lastSampledSecond) return;
    lastSampledSecond = second;
    analytics.record(scenario.scene, snapshot);
  };
  sample();

  for (let index = 0; index < totalSteps; index++) {
    snapshot = engine.step(1);
    sample();
  }

  return {
    // Absent when the run never evacuated, same convention
    // `ScenarioRunSnapshot`'s own doc comment states: compared only when
    // both sides have it, not compared against a value that doesn't exist.
    evacuationClearSeconds: options.evacuate
      ? snapshot.evacuationClearSeconds
      : undefined,
    id: scenario.id,
    name: scenario.name,
    summary: analytics.summary(),
  };
}
