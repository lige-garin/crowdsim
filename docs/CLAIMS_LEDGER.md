# Claims Ledger (audit 2026-06-19)

Status legend: REAL = genuine & verified · PARTIAL = real but narrower than
claimed · FABRICATED = asserted against constants/formulas the same code
produced · FAKE-GREEN = self-referential test that cannot fail.

| Claim (CLAUDE.md / changelog) | Status | Evidence | Disposition |
|---|---|---|---|
| GPU handles 60Hz movement (social force) | PARTIAL | Only on main-thread after WebGPU probe; default path is CPU straight-line `advanceAgentsCpu`, cap 2000 (simulationEngine.ts) | Made real & default in SP-1 |
| 3D viewport renders the crowd | FABRICATED | Renders static `benchmarkAgentPosition` grid; never reads snapshot (SimulationViewport.tsx, renderBenchmark.ts) | Real render in SP-2 |
| 10万 agent / 60fps | FABRICATED | Lives in renderBenchmark.ts/scaleBudget.ts as projection; O(n²) sort (spatialHashGrid.wgsl sort_agents) | Measured gate in SP-1 |
| GPU readback validation tests | PARTIAL | All `it.skip` in CI (no navigator.gpu in Node) | Real browser tests in SP-1 |
| "all files ≤500 lines, max 499" | FABRICATED | 9 files >500; max SimulationViewport.tsx=1199 | Corrected in Task 5; split in SP-6 |
| 4-3-2 residual MLP distillation | FABRICATED | Targets are algebraic functions of inputs; only output layer trained; no teacher (neuralResidualTraining.ts) | Relabeled Task 7; real model deferred to SP-5 |
| 70% AI workload reduction | FABRICATED | Hardcoded 6min vs 0.8min → ratio baked in (imageTracingEvaluation.ts) | Relabeled Task 7; real measurement deferred to SP-5 |
| Chrome/Edge/Safari reproducibility hashes | FABRICATED | Same-process double-run of a browser-independent FNV hash (benchmarkReproducibility.ts) | Relabeled Task 7; real Playwright matrix deferred to SP-5 |
| Weidmann/RiMEA reference physics | REAL | Genuine Weidmann speed-density eq (fundamentalDiagram.ts:36) | Keep |
| Rust DES/FSM/queues core | REAL | BinaryHeap event queue, 11 passing #[test] (core-behavior) | Keep |
| Fixed-step seeded determinism | REAL | mulberry32 seeded loop (simulationEngine.ts) | Keep |
| ~72% panels reachable | FABRICATED (as "done") | ~8/29 mounted; rest orphaned | Tracked in PANEL_STATUS.md; made real in SP-5 |
| uiProductizationAudit / *Acceptance "complete 100%" | FAKE-GREEN | Assert hardcoded 100%/no-blockers literals | Removed in Task 6 |

## SP-5b honesty fixes (in progress)

| Item | Was | Now |
|---|---|---|
| Inspector "进店率 / Entry rate" metric | The shop-decision probe's softmax store-choice probability mislabeled as a measured live entry rate (showed ~50% even at 0 agents) | Relabeled "选店概率 / Store-choice" in `AppInspector.tsx` + `dashboardV2Stats` summary; field comment clarifies it is a model probability, not a measured rate. The live loop has no shop-entry events to measure. |
