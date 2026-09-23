# ADR 0022: Wiring the scenario diff report into the live app

- Status: Accepted (2026-09-23)
- Builds on: ADR-0019 ("Deliberately standalone... NOT an orchestrator that
  runs two simulations itself... Actually running scenario A and scenario B
  side by side in the live app... is not attempted here and would need its
  own design pass")

## Context

Continuing this session's pattern of closing gaps a completeness audit
named (the same shape as ADR-0020's vehicle wiring and ADR-0021's checkpoint
chaining), the next standalone module with zero live consumers was
`scenarioDiffReport.ts`. Its own doc comment already named exactly what was
missing: a way to actually run two scenarios and get their
`ScenarioRunSnapshot`s, and a UI to trigger it.

Two things were confirmed before writing any code:

- **`ScenarioComparisonPanel.tsx` (the "M6" panel) is not an extension
  point.** ADR-0019 already established this — it ranks parameter variants
  of one hardcoded fixture scene by a single throughput number, an
  incompatible type (`ExperimentSummary`) and a different use case entirely.
  Nothing there could be reused for a two-independent-scenario diff.
- **No existing headless runner produces a `RunAnalyticsSummary`.**
  `runBenchmarkScenario` (`benchmarkRunner.ts`) steps a scenario and computes
  its own narrower `BenchmarkRunResult` (density peak, throughput, a
  reproducibility hash) — not the level-of-service/journey/flow shape
  `scenarioDiffReport.ts` (and the live "实测" panel) actually consumes. That
  shape had only ever been produced by `useRunSeries.ts`, sampling a live,
  interactively-running engine once a simulated second.

## Decision

**Reuse the scenario pool, the sampling convention, and the worker
pattern that already exist — write only the orchestration in between.**

### The runner: `scenarioDiffRunner.ts`

`runScenarioForDiff(scenario, {evacuate?})` combines `runBenchmarkScenario`'s
step-loop shape with `createRunAnalytics()`, sampling **once per simulated
second** — matching `useRunSeries.ts`'s own dedup
(`Math.floor(elapsedSeconds)`) rather than once per physics step. Recording
every physics step was the first draft; a decisive test (`samples once per
simulated second, not once per physics step`) was written against the
dedup, the dedup was temporarily removed, and sample count jumped from ~90
to 1801 for a 90 s / (1/20 s) scenario — confirming the test actually
exercises the behaviour it names, not just a number that happened to match.
`evacuate: true` calls `engine.setEvacuation(true)` before stepping and
carries `snapshot.evacuationClearSeconds` onto the returned
`ScenarioRunSnapshot`; there is still no scene-schema flag for "this
scenario is an evacuation" (unchanged from ADR-0019/ADR-0011's territory),
so the caller decides once, applied identically to both sides of a
comparison — the same reason `ScenarioRunSnapshot`'s own doc comment gives
for leaving clearance out of the diff entirely when only one side has it.

### The scenario pool: `rimeaCoreScenarios`, not the user's open scene

There is exactly one scene open in the editor at a time — nothing to diff
it against. The two scenario pickers draw from `rimeaCoreScenarios`
(straight corridor, bottleneck, corner, counterflow), the same fixture set
`ExperimentSweepPanel` and `RimeaReportPanel` already run headlessly. These
are real, structurally different scenes, not a second fixture invented for
this feature.

### The worker: `scenarioDiffWorkerClient.ts` / `scenarioDiff.worker.ts`

Same shape as `rimeaWorkerClient.ts`/`rimea.worker.ts`: a bounded headless
computation (two scenario runs, seconds of arithmetic), no progress or
cancellation needed. Only the two scenario ids and the evacuate flag cross
`postMessage` — `findScenario(id)` looks the scenario up from
`rimeaCoreScenarios` on both sides of the boundary (the worker-fallback path
in the client, and the worker itself), so nothing but plain strings needs
structured-cloning.

### The panel: `ScenarioDiffPanel.tsx`

Two scenario `<select>`s, an evacuate checkbox, a run button
(`RimeaReportPanel.tsx`'s idle/running/done/failed shape, not
`ExperimentSweepPanel.tsx`'s progress/abort one — there is nothing to show
progress on or cancel here), and on completion, `buildScenarioDiffReport`
run synchronously on the main thread (pure, no simulation, cheap) followed
by `renderScenarioDiffReportHtml` opened via `ValidationReportPanel.tsx`'s
established `Blob` + `URL.createObjectURL` + `window.open` +
delayed-revoke pattern, reused inline rather than factored into a shared
helper — the two call sites build their blob from different inputs
(`createValidationReportExportBundle`'s bundle vs. a plain HTML string), and
`scenarioDiffReport.ts`'s own doc comment already explains why the two
report renderers themselves stay separate; ponytail-review confirmed a
shared-helper extraction here would net only a few lines for a new module.
Registered in `panelRegistry.tsx` as `scenario-diff-report`
(`dataSource: "fixture"`, same as every other `rimeaCoreScenarios`-backed
panel — it reports on the built-in fixture pool, not the user's project).

## What this is not

- **Not a new scenario source.** The picker offers `rimeaCoreScenarios`,
  not the user's own open scene or an import flow — ADR-0019 left "a UI for
  picking or importing the two runs to compare" open-ended; this closes it
  with the same fixture pool every sibling panel already uses, not a new
  import mechanism.
- **Not per-store or RiMEA/sensitivity comparison.** Both were already
  explicitly out of scope in ADR-0019 and remain so — this ADR only builds
  the orchestration ADR-0019 named as missing, not new comparison content.
- **Not a declarative evacuation flag on the scene schema.** The evacuate
  toggle lives entirely in the panel's own UI state, applied identically to
  both runs; `App.tsx`'s interactive evacuate button remains the only other
  caller of `engine.setEvacuation`.

## Verified live

Real dev server, real click-through: the panel dock's "情景对比报告" entry
renders the two scenario selects (populated with the real four
`rimeaCoreScenarios` names) and a run button. Clicking it runs a **real**
Web Worker round trip — two real 90 s scenario simulations via
`createSimulationEngineFromScene`, not a mock — and the summary line reads
"RiMEA straight corridor vs RiMEA bottleneck | 5 项指标 | 0 条计数线"
(zero flow lines because neither built-in scenario names a count line — a
real, disclosed limitation of the fixture pool, not a bug). Checking
"两侧均触发疏散" and re-running moved the metric count from 5 to 6 — live
proof the evacuation-clearance metric is conditionally added exactly as
`buildScenarioDiffReport` specifies. No console errors either run.

## Consequences

- ADR-0019's own "not wired into a live UI flow" gap is closed;
  `docs/superpowers/plans/2026-09-21-gap-closure-plan.md` batch 5.4 is now
  fully closed (report + orchestration).
- 12 new tests (4 in `scenarioDiffRunner.test.ts`, including the sampling-
  cadence decisive test; 4 in `scenarioDiffWorkerClient.test.ts`, following
  `experimentWorkerClient.test.ts`'s fake-worker pattern; 4 in
  `ScenarioDiffPanel.test.tsx`, following `RimeaReportPanel.test.tsx`'s
  fake-worker panel pattern) plus one existing render-smoke test extended
  with the new panel id. 952 vitest tests, cargo test, typecheck, lint and
  prettier all clean. ponytail-review found nothing to cut.
