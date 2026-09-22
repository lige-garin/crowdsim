# ADR 0019: Scenario A/B difference report — and a correction to CLAUDE.md's own "M6 side-by-side comparison" claim

- Status: Accepted (2026-09-23)
- Gap-closure plan batch 5.4 ("情景对比报告")

## Context

The plan's own text: "方案 A vs B 的差异报告——客户真正买单的东西" (a difference
report between scenario A and scenario B — what clients actually pay for).
CLAUDE.md's own "V2 Progress" section already claimed M6 delivered
"side-by-side scenario comparison" — checked directly before building
anything, because this project has a standing rule against building a
shell for something that may already exist.

**The claim is narrower than its wording.** `scenarioComparison.ts`'s
`compareExperimentVariants` and the live `ScenarioComparisonPanel.tsx`
(registered in `panelRegistry.tsx`, genuinely clickable) only rank
parameter _variants of one hardcoded fixture scene_ — three speed/exit-width
overrides of `rimeaCoreScenarios[1]`, never the user's own open scene — by
one derived metric, throughput delta %. `ExperimentSummary`
(`experimentRunner.ts`) has no evacuation time, no level of service, no
journey times, no flow-line data. Nothing in this project diffs two
independently designed scenarios, or compares more than one number. This is
the same "a claim in CLAUDE.md is stale or narrower than worded" pattern
this session already corrected once for `multifloorScene.ts` — recorded
here rather than silently building past it.

## Decision

Build the real thing: `packages/app/src/scenarioDiffReport.ts` (+
`renderScenarioDiffReportHtml`), comparing two independently-run scenarios
across the metrics that mean the same thing regardless of how differently
they were designed — level of service (peak density, share at D-or-worse),
journey time (P50/P90/mean), evacuation clearance (only when both sides
ran one), and count-line flow matched by **name**, not id, since two
independent scenes never share entity ids but a scene author's own label
("Main entrance") is comparable across scenes.

### Deliberately standalone — the same shape every other stage-1 module in this session took

`buildScenarioDiffReport` takes two already-computed `ScenarioRunSnapshot`s
(a `RunAnalyticsSummary` plus optional evacuation clearance) and only does
the diffing and report rendering. It does **not** run any simulation
itself. Orchestrating two live scenario runs in the app — a second engine
instance, a UI for picking or importing the runs to compare — is not
attempted here and needs its own design pass, the same way ADR-0016 named
engine/worker wiring as separate, later work for vehicle simulation.

### What this is not

- **Not per-store comparison.** Two independently designed scenarios have
  no reason to share store identities (different layouts, different brand
  mixes), so there is no meaningful way to line up "shop A's queue" against
  "shop B's queue" without a naming convention this project does not
  impose. Only scene-agnostic metrics (LOS, journeys, evacuation, flow
  matched by line name) are compared.
- **Not RiMEA-suite or sensitivity-screening comparison.** Those exist
  (`rimeaSuite.ts`, `sensitivityAnalysis.ts`) but are not folded into this
  report; a future pass could add them as further comparison sections.
- **Not wired into a live "run scenario A vs B" UI flow.** A scene author
  cannot click a button in the app today and get this report — the module
  exists and is tested, the orchestration around it does not yet.

## Consequences

- `validationReport.ts`'s private `escapeHtml` was extracted into a shared
  `htmlEscape.ts` once `scenarioDiffReport.ts` gave it a second real
  caller — the same "extract once there are two real call sites" pattern
  used throughout this session (`boundedNelderMead.ts`, `csvParsing.ts`,
  `importGeometry.ts`). `renderValidationReportHtml` and
  `renderScenarioDiffReportHtml` are deliberately two separate functions,
  not a shared renderer forced over two data shapes (one scenario's
  benchmark results; a two-scenario metric diff) that differ enough that
  sharing more than the escaping helper would be the worse abstraction.
- `docs/superpowers/plans/2026-09-21-gap-closure-plan.md` and CLAUDE.md's
  own "V2 Progress" M6 entry should both be read as: the _panel_ named
  "scenario comparison" exists and is live, but compares variants of one
  fixture, not two client scenarios — this ADR is the correction, not a
  rewrite of the earlier entry, so the history of the earlier (narrower)
  claim stays visible.
