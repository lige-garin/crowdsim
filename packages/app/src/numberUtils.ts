/**
 * Small general-purpose numeric helpers shared across the app. `clamp` was
 * defined nine separate times across this codebase before this file existed
 * (an audit for B5, docs/superpowers/plans/2026-09-24-open-source-and-ux-overhaul-plan.md
 * §6.1 row 5); `packages/core-gpu/src/mathUtils.ts` already had one, just
 * never exported from that package's `index.ts` -- exporting it there was a
 * one-line fix, and `packages/app` already depends on `@crowdsim/core-gpu`,
 * so re-exporting it here is not a new cross-package dependency. `lerp` and
 * `mean` had two identical copies each and gained no canonical home before
 * this file.
 *
 * What did NOT get merged here, on purpose: `experimentSweep.ts` and
 * `runAnalytics.ts` each have their own `percentile`, but they compute
 * different things (nearest-rank vs. linearly interpolated) for different
 * reporting needs -- merging them would silently change reported P50/P95
 * numbers. `experimentRunner.ts`'s `mean` rounds its result and
 * `sensitivityAnalysis.ts`'s has no empty-array guard (returns `NaN`, not
 * `0`); both differ from the two identical copies merged below, so both
 * stay local rather than risk a silent behavior change at their call sites.
 */
export { clamp } from "@crowdsim/core-gpu";

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function mean(values: readonly number[]): number {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}
