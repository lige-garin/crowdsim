# Claims Ledger (audit 2026-06-19)

Status legend: REAL = genuine & verified · PARTIAL = real but narrower than
claimed · FABRICATED = asserted against constants/formulas the same code
produced · FAKE-GREEN = self-referential test that cannot fail.

| Claim (CLAUDE.md / changelog)                                                               | Status                               | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GPU handles 60Hz movement (social force)                                                    | PARTIAL                              | Only on main-thread after WebGPU probe; default path is the CPU social-force model (`crowdMovement.ts`, since 2026-09-14; was straight-line kinematic), cap 2000; the GPU core is still not on the app path                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Made real & default in SP-1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 3D viewport renders the crowd                                                               | WIRED + VISIBLE (SP-2)               | Was a static `benchmarkAgentPosition` grid that never read the snapshot. Now `SimulationViewport` drives the InstancedMesh from the live snapshot each frame via `agentWorldPosition` (tested in `agentInstanceField.test.ts`); the static benchmark + fake rotation are removed; HUD shows the real agent count. The crowd was wired but invisible (0.7m pale-grey boxes at the city-scale camera blend into the pale scene); now rendered via tested `agentAppearance` as widened, warm self-illuminated figures — confirmed via headless `?mainsim` WebGL screenshot (0 visible → a clear glowing cluster). **Real-WebGPU visual confirmation still pending** (sandbox has no WebGPU; tested path is WebGL fallback). |
| Crowd moves with purpose (mall behaviour)                                                   | REAL (SP-2)                          | Was an entrance→exit pass-through (every agent straight to the nearest sink; `decideAgents` never even received the shops) and the default path was empty (worker sim hung under StrictMode + a runtime worker→main path switch on WebGPU machines). Both fixed; agents now shop via a tested `mallCrowdDecisionBackend`: pick a shop by attraction (walk) → browse for the shop dwell (capacity-capped; overflow queues at the queue anchor) → leave to the exit. Verified by a headless behaviour probe: walk/browse/queue/leave all present, per-shop browsers capped at capacity, full enter→shop→leave→exit cycle.                                                                                                  |
| 10万 agent / 60fps                                                                          | FABRICATED → **MEASURED 2026-08-31** | Lives in renderBenchmark.ts/scaleBudget.ts as projection; O(n²) sort (spatialHashGrid.wgsl sort_agents)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | SP-1 GPU core (T2 counting sort, T3 fused move, T4 createGpuSimCore) replaced the O(n²) path. **Measured 2026-08-31 on real hardware, on a verified-working pipeline** (NVIDIA Lovelace, Chrome 149, page-context harness): 100k agents, 0.446–0.465 ms/step → 60fps gate MET for the core step with ~36× headroom. First numbers (0.13–0.21) were INVALID — measured on a silently-dead move pipeline (WGSL reserved keyword `meta` + 10 storage buffers over the default limit of 8); both fixed (`scanMeta` rename, fail-loud limit check in `createMovePipeline`, `requiredLimits` in all real-device specs). Real-device parity/determinism now 6/6 PASS (sort exact vs CPU oracle, move within 1e-3 over 20 steps, zero-readback invariant, twin-core determinism). See `packages/core-gpu/BENCHMARKS.md`. Scope: GPU movement-core step only; full-app fps still unmeasured (workbench HUD ~32 fps at 34 agents, same Chrome). |
| GPU readback validation tests                                                               | PARTIAL                              | All `it.skip` in CI (no navigator.gpu in Node)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Real browser tests in SP-1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| WebGPU test execution                                                                       | LOCAL gate + manual smoke            | Sandbox/CI has no usable WebGPU adapter (probed 2026-06-21); the `webgpu` node package is absent and headless Chromium yields no device                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | SP-1 T0 done: `pnpm test:webgpu` harness added (`packages/core-gpu/test-webgpu/`, vitest self-skip when no `navigator.gpu`). Verdict = LOCAL gate + manual three-browser smoke; specs run green on a real WebGPU machine. See `packages/core-gpu/test-webgpu/README.md`. Skipped ≠ pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| WebGPU-only, no WebGL fallback (ADR-0004)                                                   | CONTRADICTED docs vs code            | ADR-0004 claimed the WebGL fallback was removed, but `SimulationViewport.tsx` still imports `WebGLRenderer`/`WebGPURenderer` and calls `createFallbackRenderer()` with no user-visible mode signal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Reconciled in P0 T4: ADR-0004 marked Superseded by ADR-0006 (WebGPU for compute + labeled scale-limited WebGL/CPU compat mode, no silent degradation). Viewport HUD now shows a tested mode badge (`完整 GPU 模式` vs `兼容模式·CPU·规模受限`). `createFallbackRenderer` left intact; renderer unification deferred to P3 (`WebGPURenderer`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| SAB overlay "WASM + SAB" path                                                               | UNDOCUMENTED launch constraint       | The SharedArrayBuffer overlay needs cross-origin isolation (COOP/COEP); without it `crossOriginIsolated` is false and the overlay silently degrades to a copy path. Headers were set in `vite.config.ts` (dev/preview only), undocumented for production.                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Documented in P0 T5: `docs/DEPLOYMENT.md` records that production must send COOP: same-origin + COEP: require-corp, the degradation otherwise, and how to verify. Dev headers verified live (HTTP 200 + both headers).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Dead unmounted panels (Dashboard/DashboardV2/SimulationCredibility/BioCityWorkspacePackage) | FABRICATED (referenced by nothing)   | 4 panels imported by nothing, not in panelRegistry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Deleted in P0 T1 (repo-wide grep confirmed self-reference only); `PANEL_STATUS.md` dead section cleared.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| "all files ≤500 lines, max 499"                                                             | FABRICATED                           | 9 files >500; max SimulationViewport.tsx=1199                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Corrected in Task 5; split in SP-6                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 4-3-2 residual MLP distillation                                                             | FABRICATED                           | Targets are algebraic functions of inputs; only output layer trained; no teacher (neuralResidualTraining.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Fabricated "trained MLP/distillation" claims removed/renamed in P0 T2: `trainNeuralResidualModel`→`fitResidualProjection`, `source:"trained-dataset"`→`"fitted-projection"`, "Physics + MLP"/"MLP residual" copy reworded to residual/heuristic, `NeuralCorrectionPanel` de-registered + deleted. `socialForceCalibration` path retained; real trajectory-trained model deferred to SP-5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 70% AI workload reduction                                                                   | FABRICATED                           | Hardcoded 6min vs 0.8min → ratio baked in (imageTracingEvaluation.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Fabricated claim removed in P0 T2: `passedSeventyPercentTarget` + hardcoded minute constants deleted; ImageGeometryPanel/report no longer show any reduction %. Real image→geometry pipeline + fixtures retained; real before/after measurement deferred to SP-5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Chrome/Edge/Safari reproducibility hashes                                                   | FABRICATED                           | Same-process double-run of a browser-independent FNV hash (benchmarkReproducibility.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Fabricated cross-browser claim removed in P0 T2: `reproducibilityBrowserMatrix`/`ciMatrix` + the fake CI `reproducibility-matrix` job deleted; remaining per-scenario hash relabeled SAME-BUILD determinism only. Real Playwright Chromium/WebKit matrix deferred to SP-5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Weidmann/RiMEA reference physics                                                            | REAL                                 | Genuine Weidmann speed-density eq (fundamentalDiagram.ts:36)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Keep                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Rust DES/FSM/queues core                                                                    | REAL                                 | BinaryHeap event queue, 11 passing #[test] (core-behavior)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Keep                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Fixed-step seeded determinism                                                               | REAL                                 | mulberry32 seeded loop (simulationEngine.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Keep                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ~72% panels reachable                                                                       | FABRICATED (as "done")               | ~8/29 mounted; rest orphaned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Tracked in PANEL_STATUS.md; made real in SP-5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| uiProductizationAudit / \*Acceptance "complete 100%"                                        | FAKE-GREEN                           | Assert hardcoded 100%/no-blockers literals                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Removed in Task 6                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## SP-5b honesty fixes (in progress)

| Item                                     | Was                                                                                                                                                                                                        | Now                                                                                                                                                                                                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Inspector "进店率 / Entry rate" metric   | The shop-decision probe's softmax store-choice probability mislabeled as a measured live entry rate (showed ~50% even at 0 agents)                                                                         | Relabeled "选店概率 / Store-choice" in `AppInspector.tsx` + `dashboardV2Stats` summary; field comment clarifies it is a model probability, not a measured rate. The live loop has no shop-entry events to measure.                                           |
| Topbar "Sales / Satisfaction" KPIs       | Heuristic formulas over constants (`App.tsx`) shown as confident business KPIs                                                                                                                             | Relabeled "Sales (est.) / Satisfaction (est.)" in `bioCityUiContract.ts`; code comment marks them as estimates (density/brand proxies), not measurements.                                                                                                    |
| ProjectWorkspacePanel                    | Static `createDemoProjectWorkspace()` shown as if a live product view                                                                                                                                      | Now lists live projects via `backendClient` when one is provided; the no-client fallback is labeled "sample data · no live backend" (SP-5b T3).                                                                                                              |
| "品牌吸引 / Brand pull" %                | Reviewed: only rendered in the mounted `BrandIntelligencePanel` (an explicitly analytics panel) and a derived forecast — honest context. The bare headline was in the unmounted (dead) `DashboardV2Panel`. | No change needed.                                                                                                                                                                                                                                            |
| BioCityAnalyticsPanel "转化" metric      | `commercialConversionForecastPercent` (a forecast) shown under a bare "转化" (conversion) label, reading as a measured rate                                                                                | Relabeled "转化(预测)" in `BioCityAnalyticsPanel.tsx` (P0 T3); the adjacent "商业预测 / Commercial forecast" section was already honestly labeled. AppInspector ("选店概率/Store-choice") and topbar ("Sales/Satisfaction (est.)") confirmed already honest. |
| i18n `shopEntry` "进店率/Shop entry" key | A latent entry-rate label                                                                                                                                                                                  | Reviewed (P0 T3): the key is **unused** (no `t("shopEntry")`/`.shopEntry` consumer); displayed store-choice metric already uses inline "选店概率/Store-choice". Left as pre-existing dead i18n key (not displayed); flagged for cleanup.                     |

## 2026-07-28 tier-0 / tier-1 fixes

Commits `8486a1b tier0: gates` and `12d2078 tier1: stop the bleeding`. Every row
below was re-verified while writing this entry; the "Verified how" column says
exactly what was run or grepped, so a later reader can redo it. Rows whose
evidence could not be reproduced in this container say so.

### Tier 0 — the gates

| Item                            | Was                                                                                                                                                                                                                                                                  | Now                                                                                                                                                                      | Verified how                                                                                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check` (CI step 1) | The repo had NO prettier config at all — `.prettierrc.json` and `.prettierignore` were added by this pass — while `.github/workflows/ci.yml` runs `pnpm format:check` as its first quality step. So CI could never reach `pnpm lint`, let alone `pnpm test`.         | Whole repo formatted; config committed.                                                                                                                                  | Extracted baseline `587f7b9` to a temp tree, copied in the new prettier config, ran prettier: `Code style issues found in 58 files.` On HEAD, `npx prettier . --check` prints all-clean. |
| Silently swallowed Promises     | No type-aware lint rules, so a rejected promise could vanish with no error anywhere (this is the same class of bug as the worker freeze in tier 1).                                                                                                                  | `@typescript-eslint/no-floating-promises` + `no-misused-promises` added over `packages/*/src/**` (tests excluded); all violations fixed.                                 | Ran the new eslint config against the baseline tree: `7 problems (7 errors, 0 warnings)` — `SimulationViewport.tsx:628` and six in `useAppProbes.ts`. `pnpm lint` on HEAD is silent.     |
| `e2e/smoke.spec.ts`             | Asserted literal UI strings that the app does not produce, so the suite could not pass and the e2e gate guarded nothing.                                                                                                                                             | Rewritten as 4 journey specs anchored on `data-testid`/ARIA roles: boot-into-running + crowd rendered, GPU initialised once, editor place+undo, panel dock opens panels. | grep of the baseline app source for each asserted string (see the note below this table). The 4 new specs were NOT re-run here — this container has no Playwright browsers installed.    |
| Scene editor invisible          | `commercialResponsive.css` put `display: none` on `.scene-editor .editor-canvas-wrap` and `.scene-editor .editor-param-panel` **outside every `@media` block**, so the editor rendered as a headless toolbar at every viewport size — no canvas, no parameter panel. | Replaced with bounded height (`max-height: min(38vh, 340px)`, param panel scrolls).                                                                                      | Read `packages/app/src/commercialResponsive.css`: the three `@media` blocks start at lines 1/60/165 and the two rules now sit after them with no `display: none`.                        |
| WebGPU-unavailable messaging    | A 0.7rem line inside the HUD; otherwise a black canvas with no explanation.                                                                                                                                                                                          | A readable blocking card (`data-testid="viewport-unsupported"`, `role="status"`, `aria-live="polite"`) with reason, what still works, and a details disclosure.          | Read `SimulationViewport.tsx` around line 796.                                                                                                                                           |

Baseline `e2e/smoke.spec.ts` strings verified to be unreachable (grep over
`packages/app/src`, excluding `*.test.*`, at commit `587f7b9`):

- `"100,000 visual agents"` — the HUD renders
  `{snapshot.agentCount.toLocaleString()} {t("visualAgents")}`, and the engine
  caps agents at 2,000, so this text can never appear.
- `"cpu-compat active @ 60Hz"` and `"wasm-ready @ 10Hz"` — the substrings `60Hz`
  and `10Hz` occur nowhere in the app source.
- `"Credibility loop"` — occurs nowhere.
- `/scene=atrium-demo/` — produced only inside
  `simulationCredibility.constraints`, which no component renders.

### Tier 1 — stop the bleeding

| Item                                     | Was                                                                                                                                                                                                                                                                                                                                                                                      | Now                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Viewport rebuilt the scene every second  | The structural viewport effect also depended on `heatmapCells` and a 5-second visual clock, so roughly once per simulated second the app tore down and rebuilt the entire Three.js scene, re-ran `requestAdapter`/`requestDevice`, re-ran a blocking 45-frame benchmark and re-created ~2,000 meshes — and the cleanup never called `device.destroy()`, leaking a GPUDevice per rebuild. | Split into a structural layer keyed on `[crowdScene, viewMode]` and a time-varying layer that swaps one `Group`; cleanup now calls `gpuDevice?.destroy()`. The split rule is extracted into the pure, tested `bioCityRenderLayers.ts`. An e2e spec asserts the adapter-request count stops growing.                                                                                                   |
| `InstancedMesh` capacity                 | Allocated `performanceAgentCount` (100,000) instances to display fewer than 2,000 agents — a 6.4 MB instance-matrix upload and ~2.4M shaded vertices per frame — and left `count` at capacity, so every click raycast walked the full capacity.                                                                                                                                          | `viewportAgentCapacity = 8_192` (`renderBenchmark.ts`, documented as an allocation, not a scale claim); `agents.count = visible`; incremental matrix upload via `addUpdateRange`. `performanceAgentCount` keeps its original meaning as a scale-budget projection constant.                                                                                                                           |
| Overlay showed 240 of 1,800 agents       | `useSimulationWorkerController.ts` called `readSimulationSharedAgents(sharedMemory, 240)` in both `readAgentOverlay` and `readAgentSample`, while the shared buffer holds 2,000 agents and the HUD printed `snapshot.agentCount` — so the readout and the picture disagreed.                                                                                                             | The hardcoded limit is gone; the full frame is read (default limit = buffer capacity). The tier-1 run recorded viewport overlay counts matching telemetry exactly (16/61/101/115); **that measurement was not reproduced for this ledger entry** (no Playwright browsers here).                                                                                                                       |
| Backend authorization                    | Data endpoints were not uniformly session-checked; `ownerId`/`actorId` came from the request body; session tokens were a 32-bit FNV hash; the AI and tiles proxies were unauthenticated; quota was counted but never enforced; share tokens were client-supplied.                                                                                                                        | Uniform session auth on all data routes, cross-owner access returns 404 (not 403, which would confirm existence); `ownerId`/`actorId` taken from the session; session tokens are 256-bit `crypto.getRandomValues`; AI/tiles proxies require auth plus a model allowlist (`aiPolicy.ts`) and return 429 on quota; quota is enforced; share tokens are server-generated; configurable CORS (`cors.ts`). |
| **`POST /api/auth/login` (OPEN HOLE)**   | Accepts any `accountId` and issues a valid session — no credential is checked at all.                                                                                                                                                                                                                                                                                                    | **Still open.** A `BackendOptions.verifyLogin` hook was added so the hole is explicit (`index.ts:184-189`; without an injected verifier anyone can log in as anyone). **Real authentication MUST be wired before any deployment** — until then every session check above is worth nothing.                                                                                                            |
| `bidirectional` entrances killed agents  | The exit rule was inverted ("leave unless walking/queuing/checking out"). A freshly spawned agent has no `lifecycleState` until its first decision tick, and at a `bidirectional` entrance it spawns inside the sink radius of the gate it just walked through — so it was deleted on its first step, while `exitedCount` and throughput counted it as a completed trip.                 | `isExitBound` now only lets an agent leave if a decision sent it to an exit (`leave`/`evacuate`), with the no-decision-backend case handled explicitly.                                                                                                                                                                                                                                               |
| Queues deadlocked forever                | No renege or balk, so once a queue filled, the whole scene locked up permanently.                                                                                                                                                                                                                                                                                                        | Reproducible per-(agentId, seed) renege deadlines and distance-ranked balk/fallback shop selection in `mallCrowdDecisionBackend.ts`.                                                                                                                                                                                                                                                                  |
| Wall-stuck agents held `maxAgents` slots | `walk` had no no-progress detection: sliding movement stalls dead against walls, and the stuck agent occupied its `maxAgents` slot indefinitely.                                                                                                                                                                                                                                         | Blocked-route detection reroutes or releases the agent.                                                                                                                                                                                                                                                                                                                                               |
| Agents walked through walls              | `sceneGeometry.ts` ignored intersections with `t <= 0.02`, but `t` is a **fraction of the step**, not a distance — an agent that had crept within ~3 mm of a wall passed straight through it and ended up in rooms it could never leave.                                                                                                                                                 | The contact epsilon is now an absolute distance (`contactEpsilonMeters / rayLength`), so only the wall the agent is standing on is ignored.                                                                                                                                                                                                                                                           |
| Worker froze the sim silently            | `dispose()` terminated the worker without rejecting in-flight promises, so the caller's "tick in flight" latch never cleared and the simulation stopped with no error anywhere. Separately, concurrent worker messages made commands issued during init answer "not initialized".                                                                                                        | `dispose()` rejects every pending request with `simulationWorkerDisposedMessage` and refuses new sends; init and command handling are serialized.                                                                                                                                                                                                                                                     |
| Editor round-trip lost data              | `createEditorDocumentFromScene` `flatMap`-dropped every `bidirectional` entrance, and arrival rate was reset to 120/min on every round trip.                                                                                                                                                                                                                                             | All entrance kinds survive the round trip; `arrivalRatePerMinute` is carried through, and `defaultArrivalRatePerMinute` is only the seed value for a newly drawn entrance.                                                                                                                                                                                                                            |

### Stale-doc corrections made in the same pass

| Doc claim                                                                                                                                                         | Reality (verified 2026-07-28)                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLAUDE.md still carried the three FABRICATED claims verbatim (4-3-2 residual MLP distillation, 70% workload reduction, Chrome/Edge/Safari reproducibility matrix) | The 2026-06-19 audit rows above recorded the disposition but nobody edited the V2 Progress block. All three lines rewritten to match their ledger dispositions. `.github/workflows/ci.yml` confirmed to contain exactly one job, `lint-and-test` — no reproducibility matrix.                                                 |
| CLAUDE.md "9 files >500 lines, max SimulationViewport.tsx 1199"                                                                                                   | Stale. **14 `.ts`/`.tsx` files exceed 500 lines (11 excluding `*.test.*`), max `SimulationViewport.tsx` at 1703.** Next four: `backend/src/index.test.ts` 1064, `core-gpu/src/gpuSimCore.ts` 956, `app/src/sceneEditorState.ts` 881, `app/src/SceneEditorParamPanel.tsx` 834. Four CSS files also exceed it.                  |
| ARCHITECTURE.md "the 3D viewport renders a STATIC benchmark grid"                                                                                                 | Fixed in SP-2 and stale ever since; the `InstancedMesh` is driven from the live snapshot via `agentWorldPosition` and the static grid is gone.                                                                                                                                                                                |
| ARCHITECTURE.md / CLAUDE.md "WebGPU only, no WebGL fallback (ADR 0004)"                                                                                           | ADR-0004 is marked Superseded by ADR-0006; both docs updated to the ADR-0006 position (WebGPU for compute, labeled scale-limited WebGL/CPU compat mode, no silent degradation).                                                                                                                                               |
| `test-webgpu/README.md` "specs — authored and verified on the real machine"                                                                                       | **False**, and it contradicted `BENCHMARKS.md` ("NOT YET MEASURED") and CLAUDE.md. Measured: `pnpm test:webgpu` reports `5 skipped (5)` files / `7 skipped (7)` tests. No spec in that directory has ever been observed to run. Line replaced with the measured result.                                                       |
| CLAUDE.md M9 "a tested 3d-tiles-renderer to Three.WebGPURenderer runtime adapter"                                                                                 | `3d-tiles-renderer` appears in no `package.json`. `photorealisticTiles.ts` only stores the module name and the `import('3d-tiles-renderer')` string as a text contract, and the "tested adapter" spec drives a stub runtime object. Nothing has run against the real library.                                                 |
| CLAUDE.md M9 "visual-only glTF/GLB showcase assets"                                                                                                               | **No `.glb`/`.gltf` file exists anywhere in the repo.** `visualAssets.ts` references `/assets/showcase/wayfinding-kiosk.glb` and `/assets/showcase/atrium-shell.gltf`, but `packages/app/public/assets/` contains only an empty `biocity/` directory, so those URLs 404 and the GLTFLoader path is inert.                     |
| CLAUDE.md M6 "background Worker client/runtime for serial headless queue execution"                                                                               | Authored and unit-tested, but **never used by the app**: `runExperimentInBackgroundWorker` and `createExperimentWorker` are called only from `experimentWorkerClient.test.ts`. The mounted `ExperimentSweepPanel` calls `runExperiment` synchronously on the main thread and prints the worker request descriptor as a label. |
| CLAUDE.md + ARCHITECTURE.md list `simulationOrchestrator.ts` as the main-thread orchestration layer                                                               | Dead code. Both docs corrected; see the orphan-module row below.                                                                                                                                                                                                                                                              |

### Orphan modules (grep-verified 2026-07-28)

Method: for each module, grep every exported symbol across `packages` and `e2e`
excluding `node_modules`, `dist` and `*.test.*`. For each module below the only
match is the module itself, i.e. the sole importer is its own test.

`simulationOrchestrator.ts`, `odCalibration.ts`, `odSensitivity.ts`,
`odFlowAnalysis.ts`, `verticalTransport.ts`, `weatherIntegration.ts`,
`aiMallAutomation.ts`, `useWasmSimulationDecisionBackend.ts` — eight modules,
all still present in the tree.

`agentLifecycle.ts` was the ninth. It was deleted, with its test, by a separate
change on the same day; the grep result that put it on this list stands, the file
simply no longer exists.

Two adjacent cases that are NOT the same thing:

- `createGpuSimCore` is properly exported from `packages/core-gpu/src/index.ts`,
  but its only consumers are `test-webgpu/coreApi|determinism|benchmark100k`,
  which all skip here. No `packages/app` module imports it.
- `createExperimentWorker` is called only inside `runExperimentInBackgroundWorker`
  in the same file, and that function is called only by its own test.

Each of these has a passing test, so `pnpm test` gives no signal that the code is
unreachable. Do not cite any of them as a shipped capability; decide per module
whether to wire it up or delete it.

### Not re-verified in this pass

- `pnpm e2e` — this container has no Playwright browsers, so neither the four new
  smoke specs nor the tier-1 overlay-count measurement (16/61/101/115) were
  reproduced. They are recorded above as tier-1 results, not as fresh evidence.
- `pnpm test` / `pnpm typecheck` / `pnpm build` — not run in this pass
  (`pnpm lint`, `npx prettier . --check` and `pnpm test:webgpu` were).
- The 60fps / 100k GPU gate remains PENDING; see `packages/core-gpu/BENCHMARKS.md`.
- Concurrency caveat: a separate pass was editing `packages/app/src` while this
  entry was being written (`scaleBudget`, `ScaleReadinessPanel`,
  `validationReport`, `reportExport`, `socialForceCalibration`,
  `benchmarkReproducibility`, `i18n`, `panelRegistry`, plus the `agentLifecycle`
  deletion noted above). Everything recorded here was verified against the tree
  as it stood, but rows touching those files should be re-checked once that work
  lands.

### Note on `docs/REVIEW-2026-07-28.md`

This file was cited as input for the doc-sync work but **does not exist in the
repository** (no file matching `*REVIEW*` outside `node_modules`). Its P1-6/N7
finding, "no eslint config at the repo root", was flagged in advance as a
misjudgement and is indeed wrong: `eslint.config.js` is present at the root, and
`pnpm lint` passes with no output. That finding was not carried into any doc.

---

## 2026-08-30 freeze: unverifiable "AI" and "100k GPU" claims

Every row below was re-verified against the tree on 2026-08-30 before being
frozen. Two claims from the earlier list were **confirmed already clean** and
are recorded here so nobody re-investigates them.

### Frozen: anything labelled "AI" with no model behind it

| Where                                      | Old user-visible wording                                                         | What it actually does                                                                                                                                                              | New wording                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `aiSceneAssistant.ts`                      | `AI 草稿` / `AI draft`, `AI Mall Draft`, `AI Hospital Draft`, `AI Station Draft` | Keyword matching: `includes("mall")`, `includes("hospital")`, `includes("station")` selecting a hard-coded layout                                                                  | `模板草稿` / `Template draft`, `… Template Draft` |
| `AiImageOverlay.tsx`                       | `AI 图层` / `AI layer`                                                           | Renders hand-written fixtures from `imageTracingEvaluation.ts`; the `confidence` values (0.91 / 0.88 / 0.94) are authored constants                                                | `描图图层（示例）` / `Traced layer (demo)`        |
| `ImageGeometryPanel.tsx`                   | `AI 描图` / `AI image tracing`                                                   | Runs the cleanup pipeline over three fixtures; user uploads stay `not-traced` and draw nothing                                                                                     | `图片描图（示例）` / `Image tracing (demo)`       |
| `AiWorkflowPanel.tsx`, `panelRegistry.tsx` | `AI 闭环` / `AI 工作流` / `AI workflow`                                          | Regex + alias table (`eventScript.ts`), template rules, and `createAiProxyRequest` which only _builds_ a request — `provider: "anthropic"` is a string in a URL that is never sent | `脚本与校验` / `Script & validation`              |
| `aiReport.ts`                              | `AI 校准摘要` / `AI calibration summary`                                         | Two arithmetic expressions (pass rate, max density-speed delta) dropped into fixed sentence templates. **Exported into the shareable validation report**                           | `校准摘要` / `Calibration summary`                |
| `AppHome.tsx`                              | `TRACE` pulse value `"AI"`                                                       | No tracing capability exists                                                                                                                                                       | `"fixture"`                                       |

The `ai*` module names and `ai-*` object ids are kept as historical
identifiers; each file now carries a HONESTY NOTE stating that no model runs
there.

### Frozen: 100k GPU agents

`simulationEngine.ts` still defaults to `maxAgents = 2_000` and
`movementBackend = "cpu-compat"`, and `gpuSimCore` has zero imports from
`packages/app/src`. The 100k core has never executed on hardware with WebGPU,
so `BENCHMARKS.md` stays PENDING and this must not appear as a shipped
capability. Frozen rather than deleted: the code is real, only the claim is
withdrawn.

### Verified already clean (no action taken)

- **"工作量削减 %"** — removed in P0 T2. Only the HONESTY NOTE in
  `imageTracingEvaluation.ts:1` remains.
- **Cross-browser reproducibility matrix** — removed in P0 T2.
  `benchmarkReproducibility.ts:1` documents that the hash is a same-build
  determinism check that _cannot_ detect cross-browser divergence, and
  `benchmarkRunner.test.ts:47` asserts the worker and main-thread hashes
  differ. A real Playwright matrix is deferred to SP-5.

---

## 2026-08-30: benchmark expectations labelled, Weidmann reference added

### The self-licensing loop this closes

`benchmarkScenarios.ts` set the corridor speed expectation to **1.25–1.38 m/s**
while the engine walks every agent at a constant **1.34 m/s**. That range is
bracketed around the engine's own constant, so it could not fail as long as
agents kept moving. It was a regression guard wearing the costume of a
validation test.

The engine's 1.34 m/s is not arbitrary — it is Weidmann's free-flow mean — but
free-flow speed is only the ρ→0 end of the curve. The engine has no
density-speed coupling at all.

### What was changed

- `BenchmarkExpectation.source` is now **required** (`"literature"` or
  `"self-authored"`), with an optional `reference` field. All 15 existing
  expectations are labelled `"self-authored"`. Making it required is the point:
  a range with no stated origin silently invites the next one.
- New `pedestrianFundamentalDiagram.ts` carries the published curve and the
  comparison helpers (`weidmannSpeedAtDensity`, `compareToWeidmann`,
  `maxAbsoluteWeidmannDeviation`), with 7 tests pinning hand-computed points.

### The literature values, and where they are from

Weidmann (1993), a review of 25 investigations — the diagram RiMEA test 4
points at:

```
v(ρ) = v0 · (1 − exp(−γ · (1/ρ − 1/ρmax)))
v0    = 1.34 m/s   (free-flow speed, Gaussian, σ = 0.26 m/s)
ρmax  = 5.4 P/m²   (jam density)
γ     = 1.913 P/m² (shape parameter)
```

Sources: Jülich _Validated force-based modeling of pedestrian dynamics_, IAS
Series 13, eq. 1.12; _Physics of Human Crowds_, Annual Review of Condensed
Matter Physics, fig. 2 caption; Nikolić/Bierlaire/Farooq, STRC 2014, eq. 13;
and the Kladek-form restatement in the ECCMAS COMPDYN 2015 paper.

### The comparison result (this is the honest part)

| Density (P/m²) | Weidmann | This engine | Delta     |
| -------------- | -------- | ----------- | --------- |
| 0.5            | 1.30     | 1.34        | +0.04     |
| 2.0            | 0.61     | 1.34        | **+0.73** |
| 4.0            | 0.16     | 1.34        | **+1.18** |

**RiMEA test 4 did not pass** against the constant-speed engine recorded
above — speed was a constant, not a function of density.

**Closed on the CPU path 2026-08-31.** `advanceAgentsCpu` now measures local
density (3×3 cells of a 2 m grid) and scales speed by
`weidmannSpeedRatioAtDensity(ρ)` — the same Weidmann curve, normalised so
explicit speed overrides keep their absolute meaning — and pushes overlapping
walkers apart (0.5 m separation, 0.2 m/step cap; browsing/queueing agents
participate so a queue occupies area, not a point). The table below is what the
engine applies by construction; the _shape_ is now literature-shaped, and
`simulationEngine.test.ts` pins the ratio at 0.5/2/4/5.4 P/m² plus two
integration checks (a jammed crowd walks measurably slower than the same scene
sparse; no two walkers share a point).

Scope caveats, kept honest:

- The density input is a 3×3-cell sample of agent positions, not a validated
  measurement; the RiMEA scenarios' own geometries are still self-authored.
- The benchmark bands (all `self-authored`) were re-run after the change and
  **all still pass** — the scenarios are sparse enough that the ratio stays
  ≈1. That is consistency, not proof.
- The WebGPU movement path (`simulationMovementBridge`) had social-force
  parameters already; this change is the CPU path only.

Also note the scenario geometries are still self-authored approximations named
after RiMEA cases, not the RiMEA geometries.

## 2026-09-14: P0 — things that were shown but not simulated, or simulated from made-up inputs

From the 2026-09-14 deep review. Each item was verified in code before the fix.

| Problem                                                                                                                                                                                               | Evidence (before)                                                                                                                                                                                                                                 | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Obstacles, buildings, blocked areas and non-walkable zones did not block anyone. A construction barrier placed from the build rail was drawn and counted in analytics while agents walked through it. | `wallSegmentsFromScene` read `scene.walls` only; it is the single collision input (`simulationSceneConfig.ts`) and feeds the evacuation flow field.                                                                                               | **Fixed.** It now also emits `obstacles` with `blocksMovement`, `areas` of kind `blocked`, zones with `walkable: false`, and building footprints. Buildings get a 3 m doorway at their own entrance and at each shop entrance within 2.5 m of the facade; with no entrance they are solid. The door width is an assumption (the schema has none). Demo scene, 180 s: 388 shoppers browsed vs 374 with walls only, so arcade shops stay reachable. Routing to shops is still straight line plus wall slide; flow-field routing to every target is P1. |
| Store choice penalised crowds and queues that did not exist.                                                                                                                                          | `createBrandStoresFromScene` set `crowdLevel = 0.22 + index·0.08` and `queueLength = (index+1)·2.2` from the shop's array position, frozen at scene load. Shoppers systematically favoured shops listed earlier and never avoided a packed store. | **Fixed.** Candidates start at zero load; `createMallCrowdDecisionBackend` fills `crowdLevel` (browsers / capacity) and `queueLength` from the live tick at each choice. Test: two identical shops, the first one packed — the other now wins > 1.3× (old code: 198 vs 202, even). Static consumers (brand probe, commercial validation) now show zero crowd for a scene that is not running, which is the truth.                                                                                                                                    |
| "Sales CNY ###k" and "satisfaction %" top-bar figures.                                                                                                                                                | `80 + shopping·1.5 + brand·0.5 + density·1.1` and `94 − density·2 − queuing·0.5`, no data source. The new game HUD had already stopped rendering them.                                                                                            | **Removed** from `createBioCityTopbarMetrics` and its label contract, so they cannot be wired back on screen.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Analytics panel titled "Conversion forecast" / "Retail forecast" (转化预测 / 商业预测).                                                                                                               | The retail plan forbids calling scenario output a forecast.                                                                                                                                                                                       | **Relabelled** to "est." / 估计; the panel header already says 情景推演. Numbers unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| The printable calibration report did not describe the user's scene.                                                                                                                                   | `ValidationReportPanel` called `createValidationReport()` with no scene, so the exported PDF was about the built-in RiMEA-named fixtures.                                                                                                         | **Fixed.** The dock passes the open scene; the report names it and includes its commercial section, and states that the benchmark section is engine regression fixtures unrelated to the scene. Panel `dataSource` is now `live`; the data-source test lists every live panel by id instead of counting fixtures.                                                                                                                                                                                                                                    |

## 2026-09-14: P1 — the crowd moves and behaves like people, and the city is lit like a place

Each row was checked in code or measured before it was written here.

### Behaviour

| Was                                                                                                                                          | Now                                                                                                                                                                                                                                                                                     | Evidence / limits                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default movement was kinematic: step straight at a scalar speed, then shove apart anyone within 0.5 m. No inertia, no avoidance.             | Social-force model on the default (worker) path: velocity relaxes toward the desired velocity (τ 0.5 s), exponential social push with anisotropy, body contact term, wall push, sidestep when someone is ahead, speed cap 1.3 × free speed; walls stay hard.                            | `crowdMovement.ts`. Model form Helbing & Molnár 1995 plus the contact term of Helbing, Farkas & Vicsek 2000. **Parameters are hand-picked literature magnitudes, not fitted**; no sliding friction. The `?mainsim` WebGPU movement backend still runs the older bridge and ignores holding states. |
| Only leaving/evacuating agents used routing (2 m, 4-neighbour BFS, point-sampled walls); everyone else walked straight and slid along walls. | Every target is routed: octile Dijkstra on ~1 m cells, walls marked by supercover, no corner cutting, small toll next to walls, descent averaged over neighbours, straight line when it clears walls by half a cell diagonal + 0.35 m. Fields built lazily per target, at most 64 kept. | `crowdNavigation.ts`, `wallIndex.ts`. Walk-progress (stall) detection uses route distance, so detours are not mistaken for being stuck.                                                                                                                                                            |
| One scene-wide speed; one 0.5 m separation for everybody.                                                                                    | Per-person free speed N(1.34, 0.26) m/s truncated at ±2.5σ (Weidmann 1993), body radius U(0.20, 0.26) m.                                                                                                                                                                                | `behaviorDistributions.ts`. Not tied to the drawn age/sex of a figure (still appearance-only).                                                                                                                                                                                                     |
| Density over a 36 m² window: at realistic local crowding the Weidmann coupling was a no-op.                                                  | Density over a 1.5 m disc (7 m²).                                                                                                                                                                                                                                                       | Coupling is still imposed on desired speed, not emergent.                                                                                                                                                                                                                                          |
| Dwell and checkout time were constants per shop/counter.                                                                                     | Dwell lognormal around the shop mean (CV 0.6); service Erlang-2 around the counter mean.                                                                                                                                                                                                | CV and phase count are **self-chosen**. Draws are hashes of (seed, agent, shop), independent of processing order.                                                                                                                                                                                  |
| Every queuer targeted one anchor point; admission in array order, so later arrivals could jump the line.                                     | Queue slots 0.7 m apart along the direction away from the shop, ordered by join time; head admitted first; browsers spread over the shop floor.                                                                                                                                         | `queueSlotPosition`, `browseSpot`. Spacing self-chosen. Counters still serve everyone who arrives at once (no server count).                                                                                                                                                                       |
| Entrances admitted any arrival rate, stacking people on one point of a narrow gate.                                                          | Entrances pass at most width × Weidmann's peak specific flow (~1.22 P/(m·s)); the rest wait outside.                                                                                                                                                                                    | `weidmannMaxSpecificFlow`.                                                                                                                                                                                                                                                                         |
| Exit test used the radius of the sink nearest the agent, not the one it walks to.                                                            | Radius of the agent's target sink.                                                                                                                                                                                                                                                      | —                                                                                                                                                                                                                                                                                                  |

**Benchmarks re-baselined** (all still `self-authored`): corridor speed 1.25–1.38 → 1.15–1.34 (measured 1.24); corner 1.05–1.35 → 0.90–1.18 (measured 1.01, was 0.83 before the routing fixes); "counterflow" 1.00–1.32 → 0.70–1.16 (0.87); bottleneck peak density ≤1.5 → ≤2.5 (1.56). Speed maxima are each scene's mean free speed. **Known defect kept visible:** the "counterflow" scenario is not counterflow — each flow leaves by the exit beside its own source.

Measured (Node, demo scene): 2,000 agents 4.2 ms/step; 180 s at the scene's own rates: 529 spawned, 73 exited, 344 browsed, 88 checked out.

### Visuals

| Was                                                                               | Now                                                                                                                                          |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| No environment map: PBR parameters had nothing to reflect.                        | Painted equirectangular sky as `scene.environment`, following the day/night palette and weather; flat fills reduced to compensate.           |
| Sun fixed in the south-west at every hour.                                        | Key light follows the day (east → south → west), with a moonlight floor at night. Shadow map size single-sourced (4096).                     |
| People had no contact shadow.                                                     | Instanced blob shadow under each person; heads cast shadows.                                                                                 |
| Rain: ≤26 motionless cylinders rebuilt every 5 s.                                 | Instanced streaks that fall, drift with the wind and wrap, animated per frame.                                                               |
| Ground, plaza and scene roads were flat colour.                                   | Tiling paving, asphalt and grass textures sized in metres.                                                                                   |
| Shops: coloured floor, two boxes, a text-less bar, front assumed to face one way. | Glazed front on the entrance side, door opening at the entrance, mullions, fascia, and a named sign from a shared atlas that glows at night. |
| Scene walls unlit in 3D.                                                          | Standard material, cast and receive shadows.                                                                                                 |

Verified in Chrome (WebGPU) by screenshot, day and night. Not done: skinned characters, post-processing (SSAO/bloom), LOD.

## 2026-09-14 (later): calibration, service points, arrivals' destinations, one movement path

| Was                                                                                                                              | Now                                                                                                                                                                                                                                                      | Evidence / limits                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Social-force parameters hand-picked; the model also slowed people explicitly by Weidmann's curve.                                | τ, A, B, λ **fitted** so the speed–density relation the forces produce in a looped corridor matches Weidmann; explicit slowdown **off**. Held-out RMSE 0.079 m/s (was 0.31 with the old defaults), 0.102 m/s against the unfitted SFPE corridor formula. | `docs/calibration/2026-09-14-social-force-fundamental-diagram.md`. A fit to a published curve, not to trajectories; a second, different parameter set fits it about as well, so the curve alone does not identify the model. |
| With explicit slowdown on, dense corridors ran backwards (−0.63 m/s at 3.5 P/m²) and, once clipped, stopped dead above 2.5 P/m². | Walkers never move backwards along their heading; with the forces calibrated, 3 P/m² flows at 0.29 m/s (Weidmann 0.33).                                                                                                                                  | `crowdMovement.ts`, guard test `fundamentalDiagramHarness.test.ts`.                                                                                                                                                          |
| `calibrateSocialForceParameters` was named a calibration.                                                                        | Unchanged behaviour; honesty note says it scales hints and is not a fit.                                                                                                                                                                                 | Kept because the validation report uses it.                                                                                                                                                                                  |
| Any number of buyers were served at a counter at once.                                                                           | Counters have servers (`servicePoint.servers`, else derived from declared capacity), a line with slot order, head-first admission and reneging; buyers pick the counter with least expected time.                                                        | ADR-0008, `checkoutCounters.ts`. Line spacing self-chosen.                                                                                                                                                                   |
| Entrances could not say where arrivals go; "counterflow" benchmark had no counterflow.                                           | `entrance.exitIds` (optional); evacuation ignores it. Counterflow now crosses the corridor: 109 exits in 90 s, mean speed 1.10 m/s (93–95 % of free speed); its speed range tightened to 0.95–1.16.                                                      | ADR-0008.                                                                                                                                                                                                                    |
| `?mainsim` ran a separate WebGPU movement backend (own GPU device, O(N²) shader, ignored browsing/queuing).                      | Both paths run the CPU social-force model; the backend, bridge and hook are deleted. The WGSL readback probe stays as a diagnostic.                                                                                                                      | The resident GPU core is still not on the app path.                                                                                                                                                                          |
| React dev-mode "Data cannot be cloned, out of memory".                                                                           | The crowd reaches views through a subscription store (`liveCrowd.ts`), not props; React no longer serialises thousands of agents per render. 20 s run: 0 console errors.                                                                                 | Root cause measured in the browser's performance entries.                                                                                                                                                                    |
| No post-processing, no level of detail.                                                                                          | WebGPU 3D: GTAO ambient occlusion, emissive-only bloom, FXAA. People beyond 90 m drawn as one silhouette each; nearer people bob as they walk and shift weight standing.                                                                                 | WebGL compat mode has no post-processing (labelled mode). Skinned characters not done: would need downloaded third-party assets.                                                                                             |

## 2026-09-15: measured results, trajectory replay

| Was                                                                                                         | Now                                                                                                                                                                                                         | Evidence / limits                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Heatmap coloured by a relative ramp: "red" meant "busiest cell in this scene", whatever the actual density. | Cells are 2 m, carry people per m², and are coloured by Fruin level of service A–F (walkway bands, 1971, converted from ft²/person).                                                                        | `fruinLevelOfService.ts`. Density is a count over the sample window, not a Voronoi or camera measure.                                                                        |
| Count lines could be drawn but nothing counted them.                                                        | Crossings counted by direction and per minute, for every count line in the scene, including ones added while running.                                                                                       | `runAnalytics.ts`. Sampled once a simulated second: a person who crosses and re-crosses within one second is missed.                                                         |
| No journey or wait times.                                                                                   | Journey time (first to last sighting), and visits, P50/P90 duration and peak occupancy for each shop browse, shop line, till line and till service.                                                         | Journeys count only people who have left. Resolution is one second.                                                                                                          |
| No export of anything the run measured.                                                                     | CSV export (UTF-8 with BOM, RFC 4180) of line flows, journeys, stays, LOS over time, density grid; and a per-person trajectory table (id, t, x, y, vx, vy, state).                                          | Verified in Chrome that the panel fills from a live run; downloads not exercised by e2e.                                                                                     |
| "Record / replay" was a summary line; replay could not be watched. Frames were objects, capped at 900.      | The run is recorded into typed arrays (21 B/sample, 2 M-sample budget, oldest frames dropped). Replay pauses the run and plays the recording in the live views: scrub, 1×/4×/16×, head count, back to live. | e2e `replay pauses the run, scrubs the recording, and hands back to live`. Interpolated between one-second frames; at 8× the run is sampled about every 2 simulated seconds. |
| Operations panel list "Main corridors" with percentages.                                                    | Relabelled "Road capacity (design value)": the number is each road's design capacity / 420, not measured flow.                                                                                              | Measured line flows are in the Measured panel.                                                                                                                               |

## 2026-09-15 (later): demand profiles, walking groups, anticipation

| Was                                                                                                           | Now                                                                                                                                                                                                                                                                              | Evidence / limits                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| One constant arrival rate per entrance.                                                                       | Optional arrival profile: people a minute per slot (default 15 min), editable as a list in the entrance editor; nobody arrives after the last slot.                                                                                                                              | ADR-0009. Test: 30 then 90 per minute arrive within Poisson range, and arrivals stop afterwards.                                                                                                                                                                                                                                                                                                                                                                               |
| Everyone walked alone.                                                                                        | 70% of arriving people come in groups of 2–4 by default (Moussaïd et al. 2010, commercial walkway). Groups share the leader's plan, walk at the slowest member's speed times the observed size–speed ratio, and walk abreast when there is room. Companions do not queue or pay. | Measured in an open corridor: pairs 0.49 m apart across, 0.04 m along; the paper measured 0.40–0.54 m. The pair/triple/four split is chosen to match the observed mean size 2.22, not tabulated in the paper. Formation spring and room thresholds are self-chosen.                                                                                                                                                                                                            |
| Group version 1 blocked the demo exit and sent companions into till lines.                                    | Companions wait in place while the leader queues; formation relaxes near walls and strangers. Demo scene exits from 300 s to 900 s are 1,733 with groups against 1,706 without.                                                                                                  | More people are present at once with groups, because groups walk slower and wait for each other.                                                                                                                                                                                                                                                                                                                                                                               |
| People reacted only to how close others were; head-on walkers turned 0.5 m apart and their bodies overlapped. | Time-to-collision force (Karamouzas, Skinner & Guy 2014, k = 1.5, τ₀ = 3 s) within 3 m, replanned at 20 Hz. Head-on walkers start giving way 2.85 m apart and pass 0.57 m apart.                                                                                                 | One-way fundamental diagram changes by at most 0.03 m/s, so the earlier fit stands; no refit. Cost: 7.2 ms against 4.9 ms per step at ~980 people. Five heavy specs had their timeout raised to 20 s — six of the eight have since been halved to 10 s on measurement, and the two panel-dock cases genuinely need the headroom. **The step cost in this row was measured with a dev server running, and the 2.85 m / 0.57 m figures do not reproduce; see 2026-09-19 below.** |

## 2026-09-19: step cost, and the give-way numbers that would not reproduce

**Step cost, measured properly.** 1000 people in a 160x8 m corridor, four steps
per call: **5.45 -> 2.42 ms per step** after two changes to `crowdMovement.ts`
(`Math.hypot` -> `Math.sqrt(x*x + y*y)`, and writing the neighbour loop out
instead of calling back into a fresh closure per walker per step). The model is
arithmetically unchanged.

Every step-cost number in this ledger taken before today - including the
"7.2 ms against 4.9 ms" above and a 5.83 -> 4.51 ms note written and then
struck - was measured with a dev server listening on 5173 on the same machine.
That roughly doubles a step and reports nothing. **Any step-cost figure taken
while 5173 is up is worthless.**

**"2.85 m / 0.57 m" does not reproduce.** Measured today on the same code:
2.46 m and 0.53 m, with the pair starting 0.1 m off head-on. The give-way
distance swings with that starting offset - 1.38 m head-on, 2.46 m at 0.1 m,
2.65 m at 0.2 m - because the trigger is a sideways speed, and a symmetric pair
produces almost none until they are nearly touching. It is not a stable
quantity to quote, so the test now only puts a floor under it. **The passing gap
is stable** (0.534-0.568 m across those three setups) and is what the test pins:
`> 0.51`, with the measured value written beside it.

**Anticipation at 10 Hz costs nothing measurable.** A test compares a pair
passing with the anticipatory push replanned every step against every sixth
step: the gap is within 0.05 m. That was the one lever left for buying step
time, and it turns out to be cheap - but there is no longer a gap to buy, so the
engine stays at 20 Hz.

## 2026-09-20: evacuation pre-movement time and exit choice

Evacuation used to start every person on the same decision tick and send all
of them to whichever door was nearest. Neither is true of a real evacuation,
and both flatter the result — an instant, evenly spread start, and a crowd
that never competes for a door.

Changed:

- **Pre-movement time.** Each person now waits their own drawn time before
  starting to move. Lognormal, because observed pre-movement times are
  strongly right-skewed: most move within seconds, a few take several times
  the mean.
- **Exit choice.** Distance plus a penalty for everyone already committed to
  that door, so the flow spreads over the exits a building has. Which door
  someone came in by no longer constrains which they leave by — that is a
  routing rule for a normal day.

**Every new number here is self-chosen and uncalibrated**: the pre-movement
mean (16 s), its spread (CV 0.75), and the crowding penalty (4 m per person).
This project has no observed evacuation to fit them to. The claim is narrow
and testable — people no longer all start on one tick, and they no longer all
queue at one door — and the tests assert exactly that and nothing more.
**None of this predicts any real building's evacuation time**, and no number
produced by it should be quoted as one.

## 2026-09-20: the GPU movement backend is not wired in, and the panel said otherwise

The readiness panel read `WebGPU movement: webgpu-ready verified`. It was not,
in the only sense that matters: **nothing runs on it.**

The engine steps its crowd in `crowdMovement.ts`, which carries the behaviour
the model is judged on — walking groups, queueing, the anticipatory push, wall
constraints, exits. `movementBackend.ts` is a much narrower thing: a CPU and a
WebGPU implementation of the bare social force, plus a probe that checks the
two agree **on four agents**. No production code calls either backend to run a
simulation; `App.tsx` hard-codes `movementBackend: "cpu-compat"`.

So the panel was reporting a probe result as if it were a running system.
Changed to `webgpu-ready · probe only`, and the module now says at the top
what it is and is not.

Wiring this in for real is not swapping a step function: it means teaching the
GPU path everything `crowdMovement.ts` already does. Not done, and it should
not be started as a performance move — the CPU step is currently 2.42 ms at a
thousand people, so there is no pressure on it to carry.

## 2026-09-20: floors, stage 1 — drawn, and one of them simulated

ADR-0010 stage 1. A scene can now hold more than one floor, and the editor
draws one at a time. **Nobody can move between floors**: connectors are stage 2
and do not exist, so a run simulates one floor and it is the lowest.

What was already there, and what was missing. `scene.floors[]` and a bare
`floorId` on four retail primitives (basemap, zone, store lot, shop) were
committed long before this; nothing read either on any running path. The gap
was that walls, entrances, service points, count lines, targets, areas and
hazards — the primitives a run is built from — had no floor at all, so a
"floor" could not have held a plan.

Changed:

- **`floorId` on every primitive that stands somewhere**, through one
  documented `floorIdSchema`, and a scene whose `floorId` names no declared
  floor is now **rejected** rather than put nowhere.
- **One rule for what a floor contains** (`sceneFloors.ts`): a scene with no
  floors is one floor and everything is on it; a primitive with no `floorId` is
  on the lowest floor. Both keep every scene written before floors working
  untouched — and every scene in this repository is one of those.
- **The editor draws one floor** (`sceneEditorFloors.ts`, `SceneEditorFloorBar`):
  add a floor, switch floors, and what is drawn, counted and crowded is that
  floor alone.
- **A run takes one floor** (`simulatedFloorScene`), inside `deriveSceneGeometry`
  so that every engine build and every hot update goes through it. Flattening
  the stack instead would let an upstairs wall block a walker downstairs and
  still look like an answer.

**The limit, stated where it can be seen**: the floor bar says floors can be
drawn and not walked between, and the engineering signals say how many floors
a scene has and that the lowest one is what ran. **No number a run produces
says anything about an upper floor** — it holds no crowd, its shops are never
chosen, its count lines count nobody. The editor no longer draws the crowd or
the heatmap over an upper floor for the same reason: both are measurements of
a floor that is not the one on screen.

Deleted in the same pass: `multifloorScene.ts` and the "2 楼层" line in
`ScaleReadinessPanel`. The panel built a two-floor stack out of two copies of
the demo scene, with a stairs connector nothing routed, and printed the floor
count as readiness. With real floors in the schema that line is a claim about
a capability that does not exist. Its `VerticalConnector` types were the only
part worth keeping, and stage 2 should design them against a router rather
than inherit them from a display object.

**Not done**: connectors, routing across floors, agents with a floor, and
rendering a stack. Nothing here is calibrated — the 4.5 m floor-to-floor gap
is a drawn default, read by nothing that simulates.

One thing the e2e caught that unit tests could not: the editor's grid declared
one row per child, and the new floor bar took the row sized `1fr` — so the plan
dropped into an implicit row, shrank to 100 px, and its lower half sat under
the HUD tray, where a click lands on the tray. Both grid templates now count
the bar. `pnpm e2e` 9/9.

## 2026-09-21: floors people can actually walk between (ADR-0010, the rest of it)

Stage 1 gave a scene floors that could be drawn and said plainly, on screen,
that nobody could walk between them. That sentence is now false and has been
removed from the editor and the engineering signals, because the thing it
described is built.

What a run does now:

- **Connectors** — `scene.connectors`, stairs and escalators. Someone walking
  to another floor walks to the connector, crosses it, and walks on; they are
  held for the flight's travel time and are in no crowd while crossing.
- **Costs in metres of walking**, so a shop upstairs and a shop at the far end
  of this floor are comparable numbers. A connector's cost is its travel time
  times the crowd's mean speed.
- **One crowd per floor.** Two people over the same plan coordinates on
  different floors do not push each other.
- **Capacity.** A connector takes width × Weidmann peak specific flow people a
  second — the entrance rule (ADR-0008), because a stair mouth and a door are
  the same constraint. The rest wait at the mouth.
- **The editor and the stage each show one floor**, with that floor's crowd and
  that floor's heatmap. A run's heatmap is now per floor for the same reason a
  plan is: two floors drawn over each other is a picture of neither.

**Numbers that are guesses, and are labelled as guesses in the code**: nothing
here is calibrated against an observed stair or escalator. The travel speeds
are literature-typical — Weidmann's 0.61 m/s up and 0.694 m/s down for stairs,
0.5 m/s for an escalator under EN 115 — applied along a flight taken as twice
the rise (30° pitch). **No number a run produces is a claim about how long a
real building's stairs take.**

**Lifts are refused, not faked.** The schema rejects `kind: "elevator"`. A lift
is a queue with a batch service; modelled as a sloped walk it gives an answer
that looks reasonable and is wrong, and a scene that cannot describe one cannot
be read as having simulated one.

**Phased evacuation is still not modelled.** An alarm sends everyone to an
exit, and people upstairs route down. Whether a real building would evacuate
the floors away from a fire is a safety claim with no basis here.

Deleted in the same pass, per the orphan rule: `multifloorScene.ts` and the
readiness panel's "2 楼层" line, which counted two copies of the demo scene
with a stairs connector nothing routed and printed it as a capability.

### Cost, measured

Corridor harness, 881 people, best of six rounds, both variants inside one run
so drift hits both: **one floor 0.56–0.70 ms/step, two floors (everyone on the
ground) 0.65–0.74**. Declaring floors costs about a tenth of a millisecond a
step. Against the same harness on HEAD before this change (0.53–0.56), the
one-floor path is unchanged as far as this method can tell — **repeats of one
build varied more than the two builds differ**, and the same one-floor case
drifted from 0.53 to 0.70 over the session as the machine warmed. The 2.42 ms
in CLAUDE.md is a different scene and none of these numbers replace it.

## 2026-09-21 (later): the floors feature reviewed, and seven defects fixed

A review of the multi-floor commit found that **the case the feature exists for
did not work**, while the tests shipped with it stayed green — they followed
people to an exit, and the retail path was never walked. Measured before the
fixes, on a two-floor scene with one shop upstairs: with a 4.5 m storey, **not
one person reached the upper floor in 200 s**; with the same scene at a 0.2 m
storey, 59 did.

Fixed, in the order they were found:

1. **A ride counted as a stalled walk.** The blocked-route rule gives a shopper
   five seconds to close 0.25 m; a rider is held still for the flight's travel
   time, which is 14.7 s for a real storey. So everyone bound for a shop
   upstairs was declared unable to reach it and sent to an exit, part way up.
   `isCrossingFloors` now tells the rule the difference between crossing and
   being stuck; the distance already covered is kept as the baseline.
2. **Companions never followed their leader across.** `followLeaders` copied
   the leader's target coordinates but not their floor, so a companion walked
   to the leader's destination as though it were on their own floor. They also
   inherited `browse`, which holds someone where they stand, so they never even
   reached the stairs; and rewriting their transfer each tick dropped them off
   the connector they were already on. Measured before: 25 of 40 leaders
   upstairs, **0 of 37 companions**. Default group share is 0.7.
3. **Floors and connectors were not counted when issuing ids.** Add a floor,
   apply, reopen, add another, and the second was called `floor-1` again —
   apply then failed with "Duplicate scene entity id". The same failure this
   function's comment records having fixed once for shops.
4. **Deleting an occupied floor deleted the people on it, silently.** They
   matched no floor in the per-floor step, so they vanished a step after the
   edit with the crowd count dropping and `exitedCount` unmoved (80 → 59).
   They now leave the run at the edit, where it can be seen, and still are not
   counted as exits — nobody walked out.
5. **The measured metrics mixed floors.** A count line on one floor counted
   people crossing the same plan coordinates on another, and the density grid
   behind Fruin level of service summed the floors, reporting a crowd standing
   where nobody is. Both are per floor now, the density CSV carries the floor,
   and the jump from one floor to another no longer registers as a crossing.
6. **A decision with no floor on it invented a transfer to an undefined
   floor.** `checkoutCounters` emits exactly such decisions, so every till
   decision on an upper floor set a cross-floor transfer that no connector
   could serve. A missing floor now means "here", which is what every
   floor-unaware decision backend means, and the till decisions carry their
   floor.
7. **A whole-building KPI had quietly become a per-floor one.** "Peak density"
   was read off the watched floor's heatmap, so it changed when someone clicked
   a floor button, beside an agent count that stayed whole-building. It is
   measured per floor and reported as the highest of them.

**Nine regression tests** cover these, all of which fail on the previous
commit: shopping up a 4.5 m staircase, a buyer reaching a till, companions
following, ids surviving a save and reopen, a deleted floor's crowd leaving
countably, count lines and density staying on their own floor, and a
floor-less decision staying on the walker's floor.

The step cost was re-measured on the fixed code, and the ADR's figures were
wrong in a way worth naming: they had been taken on a build with three step-loop
optimisations that never reached the commit. The new figures are in ADR-0010,
with the warning that the absolute numbers drift by a factor of two over a few
hours on the same machine and only a pair measured in one run means anything.

## 2026-09-21 (later still): who the crowd is (ADR-0011, plan item 1.1)

`pedestrianPresets.ts` has held a published population since M5 — IMO
MSC.1/Circ.1533's twelve groups, each with a walking speed range on the flat,
up stairs and down — and **it was wired to the validation report only.** The
report printed the table while the simulation walked every one of those people
at the same 1.34 m/s. A page about mobility-impaired passengers, and a run that
did not have any.

A scene can now declare who its crowd is (`scene.population`, or
`entrance.population` per door), and the people drawn from it walk at that
profile's speeds — including **per person on a staircase**: a connector carries
its length, and whoever crosses is held for `length / their own stair speed`.
The editor offers the IMO passenger mix by name on the entrance panel, so the
feature is reachable without hand-editing JSON.

**A scene that declares nothing is unchanged**, and a test pins that: no agent
carries a profile and the speed distribution is what it was. This matters
because `docs/calibration/` was fitted against that single distribution and
does not carry to a declared population.

What it does not claim: the shape inside each published range is uniform, which
is **this project's choice, not the source's** (IMO gives min and max only) —
said so in the module and printed in the report. The label carries speed and
nothing else: no behaviour, patience or route choice follows from it. And the
IMO population describes **ship passengers** (40% mobility impaired, no
children), so choosing it for a shopping street is the scene author's decision;
the report now names the population a run used so that decision stays visible.

**A correction to the plan that ordered this work.** It said wheelchair users
must not be routed to stairs. That rule was **not built, because the data does
not support it**: IMO's table gives the mobility-impaired groups non-zero stair
speeds, and does not separate wheelchair users from people with a stick or a
slow gait. Building the flag anyway would have invented a category the source
does not have. It belongs with the lift work, and ADR-0011 says so.

### A test-suite finding, unrelated to the feature

Adding these cases made two or three arbitrary tests fail on `Test timed out`,
a different set each run, while each passed on its own. The cause was **CPU
over-subscription, not a slow test**: the heavy cases render every panel or step
a simulation, and a fork per core starved them. Measured: over-subscribed →
three timed out; at `maxWorkers: "50%"` → 686 passed. The cap is now in
`packages/app/vite.config.ts` with that measurement in the comment. Two of the
new cases were also made cheaper first, and one redundant simulation was
dropped — but the cap is what fixed it, and pretending otherwise would leave
the next person chasing a flake.

## 2026-09-21: repeated runs and intervals (plan item 1.3)

Every number this product showed came from **one run at one seed**. A first-line
report gives a range over repeated runs. The machinery for that — an experiment
runner, a queue, a worker and its client — had been written and unit-tested
since M6 and **was never called by the app**: `ExperimentSweepPanel` ran one
sweep synchronously on the main thread (freezing the page) and printed the
worker request it never sent as a label.

Changed:

- **The sweep runs in the worker that was written for it**, with progress and a
  stop button. An e2e pins the part that was missing: the crowd keeps moving
  while the sweep runs, which it cannot do if the work is on this thread.
- **A bootstrap interval for the mean** (`bootstrapMeanInterval`): percentile
  bootstrap, 2,000 resamples, seeded so a report repeats. Chosen over mean ±
  1.96·SE because these metrics are not symmetric — an evacuation time has a
  floor and a long tail — and the bootstrap does not assume they are. Coverage
  is checked against a known mean: 100 trials, the interval must contain it at
  least 88 times.
- **No interval below two runs.** One run has no spread, so the panel prints
  "1 run, no interval" instead of a bare number that reads as exact.
- **The measured panel says what it is**: one run, one seed, no interval, and
  where to get one. The printable validation report carries the same sentence.
  Neither invents an interval it did not measure — the live panel _cannot_ have
  one, because it watches a single run by construction.

The default is five runs per variant. That is a starting point for a look and
**not a defensible sample size for a report**; the code says so where the
number is set. Nothing here makes the underlying figures more accurate: it
makes the spread visible, which is a different and more honest claim.

## 2026-09-21: where this engine stands against RiMEA

`benchmarkScenarios.ts` has said since P0 that its scenarios are **named
after** RiMEA tests but are not RiMEA geometry. So "which RiMEA tests does it
pass?" had no answer in the product. It has one now, and getting it required
correcting three of this session's own mistakes.

### What the guideline actually says

Obtained from the publisher: **RiMEA 4.1.1 of 11.09.2025**, RiMEA e.V.,
www.rimea.de, licensed **CC BY-ND 4.0**, German version authoritative. Annex 1
defines **sixteen** tests across A 2 (components), A 3 (functional) and A 4
(qualitative). Only the parameters are recorded in `rimeaSuite.ts` — geometry,
densities, time windows — each with its clause; the text is not reproduced.

### Three corrections to what was written earlier today

1. **The version was wrong.** Everything written before this said "RiMEA 3.0".
   The current edition is 4.1.1; 4.0.0 (2022) is the previous one.
2. **The test list was wrong.** An earlier pass wrote fourteen tests from
   memory with smoke at 13 and lifts at 14. There are sixteen, and **there is
   no smoke test and no lift test at all**: 13 is the fundamental diagram on
   stairs, 14 is choice of route. That list is now the guideline's.
3. **The judgement was wrong.** Test 4 asks for densities up to 6 P/m², and
   Weidmann's curve — the yardstick this project chose — reaches **zero at its
   jam density of 5.4**. Comparing against it above that density made every
   non-zero speed a deviation, so the worst error always landed on the densest
   point (0.465 m/s at 6 P/m², against a reference of 0.00). Those points are
   now measured and reported but judged against nothing, which is what the
   guideline asks for: it wants the diagram measured and sets no threshold.

### Test 4, run to the guideline's own parameters — and it FAILS

Densities 0.5, 1, 2, 3, 4, 5, 6 P/m²; the mean speed over **60 s** after a
**10 s** transient (A 2, p. 30). Result: **worst deviation 0.148 m/s at
0.5 P/m²** (model 1.15, Weidmann 1.30) against a 0.10 m/s tolerance — so it
fails, at the _sparse_ end, where the model does not quite reach free-flow
speed. 6 P/m² measured 0.47 m/s and is reported unjudged. The tolerance was
not widened to make any of this pass.

**A declared departure**: the guideline's corridor is 1,000 m × 10 m, which at
6 P/m² is 60,000 people — not steppable in a browser, and not what the
measurement needs (a local speed in an equilibrium stream). It is measured in
a 20 m × 4 m periodic corridor instead, the usual approach in the literature.
That paragraph sits beside the number in the code and in the panel's criterion
string, so it travels with any report that quotes it.

### The other fifteen

All `needs-scenario`: the parameters are recorded with their clause, the
scenario is not built. Two are worth noting because the engine is close —
test 1 (one person, 2 m × 40 m corridor, travel time 26–34 s at 1.33 m/s) and
test 6 (twenty people round a left-hand corner without passing through walls)
are buildable today. Tests 2, 3 and 13 need a staircase a crowd can stand on,
and connectors are not that: they hold one person for a travel time.

The suite runs in its own worker (about 90 s for the sweep) and the unit tests
exercise the same code path with one density and a two-second window — a
result produced that way is **not** the test, and the code says so.

## 2026-09-21: two RiMEA tests built, and one of them says something awkward

Tests 1 and 6 are now built to the guideline's own parameters, so the suite
reads **2 passed, 1 failed, 13 not built, of 16** — measured in the app, not
only in a test run.

### Test 1 (corridor) — passes, and the interesting number is the one beside it

A 2, p. 29: one person, a 2 m x 40 m corridor at 1.33 m/s, travel time
26-34 s. Measured: **median 30.4 s over 20 walks, range 24.6-46.8 s, and only
10 of the 20 inside the window**.

The median is almost exactly 40 / 1.33 = 30.1 s, so the model's typical speed
is right. Half the walks miss the window because **this engine draws free
speeds with a 19% spread (N(1.34, 0.26)) where the guideline's window was
built from 5%**. The criterion is stated about one person, so which person is
drawn decides the answer; the test is therefore judged on the median of twenty
walks, with the share inside the window reported next to it.

Turning the spread off would have made it pass twenty times out of twenty and
told nobody anything. The spread is a modelling choice this project made and
documented (`behaviorDistributions.ts`); the mismatch with the window is a real
finding about both.

### Test 6 (corner) — passes

A 2, pp. 30-31: twenty people round a left turn in a 2 m corridor with 10 m
arms, without passing through walls. Measured: **20 went round and out, nobody
left the corridor**, where leaving is checked every step against the L-shaped
region (`insideCorner`).

Two mistakes surfaced while building it, both in the scene rather than the
engine: the exit was placed a metre past the end of the arm, so walking to it
meant leaving the corridor and the check correctly failed; and the intake
window let 39 people in when the test wants twenty.

**A declared departure**: the guideline starts the twenty already standing,
spread over a 6 m stretch. This engine only brings people in through a door, so
they enter over ten seconds at the middle of that stretch. What the test checks
— getting round, staying inside — is unaffected, and the criterion string says
so.

### Still not built: thirteen

Each names its clause. Tests 2, 3 and 13 are blocked on the same thing: they
need a staircase a crowd can stand and walk on, and a connector is not that —
it holds one person for a travel time and puts them down at the other end.
That is the next real piece of modelling, not a scenario to write.

## 2026-09-22: stairs a crowd can stand on — tests 2 and 3 built, and a mistake on test 13 caught before it shipped

`docs/adr/0010-multi-floor-and-vertical-circulation.md` named this as "left
for later": a connector was a point at each end, holding one person for a
travel time. It is now a place — `floorRouting.buildFlightLane` gives each
connector its own straight corridor (`lengthMeters` long, its own `width`
wide, in coordinates of its own since the two mouths generally sit at
different points on two different floor plans). Someone who boards is placed
on that lane and stepped by the same social-force loop as any real floor
(`crowdMovement`, `simulationEngine`): pushed by whoever else is on the
flight, held off its two side walls, walking at their own literature stair
speed rather than a precomputed duration. Arrival is a matter of distance now,
not the `ridingUntilSeconds` timer ADR-0010 originally shipped with.

**698 → 712 tests, all green**, including nine regression tests written
against the new mechanism (boarding, mid-flight, arrival, connector-deleted
fallback, traffic gating, group-follow onto a connector, the top-of-loop
guard against a decision corrupting a mid-flight transfer) plus three for
tests 2/3 themselves.

### Tests 2 and 3 — built to the guideline's own text, and pass

A 2, p. 29: "the considerations from test 1 apply accordingly with adjusted
values for route, duration and speed" — a person on a 2 m wide, 10 m long
(along the slope) staircase at "a defined walking speed". The defined speed
used is this project's own literature stair speed (0.61 m/s up, 0.694 m/s
down, `floorRouting.connectorSpeeds`) — the same one every stair in the app
defaults to.

Measured (deterministic — no population declared, so every walk takes the
same nominal time to a fraction of a step): **up, median 16.82 s** (window
14.2–18.5 s, pass); **down, median 14.87 s** (window 12.5–16.3 s, pass).

**The window is this project's own extrapolation, not RiMEA's text, and says
so in the criterion string.** The guideline states the three tolerances that
went into test 1's published 26–34 s window (40 cm body, 1 s premovement, 5%
speed) but not the arithmetic that combines them — reconstructing that
arithmetic here did not reproduce 26 s at either extreme applied to test 1's
own numbers. What the text does make reproducible is the _ratio_ test 1's
window bears to its own nominal time (86.4%–113.0%), so that ratio, applied to
the stair's own nominal time, is what is used. A different, defensible
combination of the same three tolerances could give a different window; this
one is not RiMEA's, and every place that shows it says so.

### Test 13 — a mistake, caught by reading the source before writing it up

The first attempt at test 13 assumed it was a density sweep like test 4's,
just at a stair's free speed — a natural-seeming generalisation, and wrong.
**It was built and "passing" briefly, entirely on an assumption never checked
against the guideline's own page.** Reading A 4, pp. 42–43 (Fig. 17) after
the fact showed the real test: a fixed scenario, not a sweep — a 10 m × 10 m
room of 100 agents flowing through a 2 m wide, 5 m long stair (2 m approach on
each side) to a goal, run once climbing and once descending, with density and
speed read over the stair's **horizontal projected area** (not the slope
length this project's connectors use internally). It is judged against
Fig. 16, a shaded speed–density band read off a real test with **no printed
table** — digitising that band precisely enough to compare against is its own
piece of work, not yet done. The periodic-corridor code was deleted rather
than kept mislabelled; test 13 is back to `needs-scenario` in `rimeaSuite.ts`
with the real blocker recorded, not the resolved one.

**The suite now reads 5 passed, 0 failed, 11 not built, of 16** — one more
built than the 2026-09-21 count of "2 passed, 1 failed, 13 not built" (tests 2
and 3 newly built; test 4 unchanged, still failing at the sparse end; test 13
attempted, found not to be what it looked like, and put back).

One incidental finding from the retracted test-13 code, kept here rather than
in the product because it was never that test's answer: on a 2 m wide, 20 m
periodic corridor at stair free speed (0.61 m/s), this project's social-force
parameters — fitted to the _level_-corridor Weidmann curve
(`docs/calibration/`) — jam to near-zero speed by about 2 P/m², far short of
Weidmann's own 5.4 P/m² jam density, and the measurement stops being reliably
monotonic beyond that (0.0001 m/s at 4 P/m², 0.12 at 6 P/m², most likely an
equilibration artefact of a nearly-frozen crowd rather than a real un-jamming).
Nothing in this repository has fitted parameters for a narrow, slow-speed
corridor specifically, and this is a real data point that they may not
transfer — worth a look before test 13's own scenario is built, not
investigated further here.

### One disclosed regression, in display only

A rider's `floorId` is now the flight's own synthetic id
(`floorRouting.flightFloorId`), not either real floor. Nothing that draws or
buckets agents by floor — `agentInstanceField.selectCrowdAgents`, the
heatmap, `runAnalytics` — knows what to do with that id, so a rider is not
shown on, or counted toward the density of, either floor while on the flight;
they are simply not drawn for the seconds they are on the stairs, then
reappear at the far end. Before this change they were shown frozen at the
mouth for the whole ride, which was its own, different fiction. Drawing riders
along the flight itself is left for later.

## 2026-09-22 (second entry): RiMEA tests 5 and 16 built — and a real bug found along the way

Following on from stairs (above): tests 5 (premovement time) and 16 (1D
fundamental diagram) are now built. The suite reads **7 passed, 0 failed, 9
not built, of 16**.

**Correction (2026-09-22, third entry, below): this "0 failed" was wrong.**
Test 4 fails at its own real parameters — verified directly:
`runFundamentalDiagramTest()` with no cheap overrides reports `status:
"fail"`, worst deviation 0.142 m/s at 0.5 P/m², against the already-recorded
0.10 m/s tolerance. This was already known and written up honestly
elsewhere (CLAUDE.md's 2026-08-30 and 2026-09-21 entries both say test 4
fails), so nothing about the _finding_ was hidden — only this one summary
line, written the same day as the entry it sits in, undercounted it. The
correct count for the 7 tests built at that point was 6 passed, 1 failed.

### Test 16 (1D fundamental diagram) — built, and it needed its own jam density

A 4, p. 47: density in **persons per metre**, not per square metre — a
different unit from test 4's — on a corridor "the width of one agent, so
agents can move freely without being able to overtake". Reused test 4's
periodic-corridor method (the guideline's own text says its ring and a
straight corridor answer the same question) at that width instead of a level
corridor's, converting the 1D density to the area density the harness takes.
Judged against Fig. 20 — a shaded 10/90th-percentile envelope with **no
printed table**, raw data behind a download from RiMEA's own site, not
fetched — so, as with test 4's points past Weidmann's jam density, the only
judged property is physical necessity: speed does not rise with density.

That property needed its own boundary: this corridor's own geometric jam
(bodies of radius up to 0.26 m cannot stand closer than one diameter apart,
`1 / 0.52 ≈ 1.92` people/m) is far short of test 4's 6 P/m² ceiling, and past
it the measured curve **swung between states seconds apart** (0.30, 0.53,
0.37, 0.46 m/s at 2.25-3 people/m in one run) rather than settle — plausibly a
real stop-and-go instability single-file crowds are known to show near their
own jam density, or a 60 s window too short for this geometry, or both;
nothing built here distinguishes which. Judging that range against an
invented slack would have hidden the question rather than answered it, so it
is measured and reported, unjudged, the same way test 4 already treats its
own beyond-jam points.

### Test 5 (premovement time) — built, and building it found two real problems

A 2, p. 30: ten people in an 8 m x 5 m room, a 1 m exit, premovement times
"uniformly distributed between 10 s and 100 s" — not this project's own
lognormal. `createMallCrowdDecisionBackend` gained an injectable
`evacuationReactionSecondsFor`, defaulting to the existing lognormal, so a
scenario can supply a different draw without a second permanent distribution
living in the product. `behaviorDistributions.sampleUniformReactionSeconds` is
that draw for this test.

The first two attempts to run it failed for reasons that had nothing to do
with premovement timing, and both were real:

1. **A waiting person was not standing still.** Every agent is spawned
   pointing at a sink by default (`simulationEngine`), and "carry on with
   what they were doing" — the evacuation branch's existing rule for anyone
   whose premovement time has not passed — has nothing to carry on with for
   someone who has never been given a real decision at all. With no shops in
   this scene, that meant every person spent their whole wait visibly walking
   toward the exit regardless of their assigned time, making the premovement
   window invisible in practice. **Fixed in the product, not just the
   test**: `mallCrowdDecisionBackend`'s evacuation branch now pins anyone
   caught with no decision at all to where they are, once, until their own
   time comes. This also corrects the same case in any real scene — someone
   who spawns after an alarm has already sounded, mid-run, no longer
   speedwalks to the nearest exit before they have had time to react to
   anything.
2. **Ten people at a 1 m door queue, regardless of reaction time.** Even
   after (1), several seeds showed gaps of 30-60 s between an assigned
   premovement time and when that person actually got out the door — because
   Weidmann's peak specific flow puts a 1 m door's throughput under two
   people a second, and a uniform draw over 10-100 s clusters more than a
   couple of departures together often enough with only ten draws. Measuring
   time-to-exit conflates queueing (an unavoidable consequence of the
   guideline's own geometry) with reaction time (what the test is actually
   about). Fixed by measuring the moment each decision flips to "evacuate" —
   starts moving — instead of the moment the door lets them through.
3. **A third, smaller bug**: the burst that spawns the ten people drew from a
   Poisson distribution with mean 10 over a one-second window and no way to
   catch up once that window closed, so an unlucky draw (as few as 4 of 10 on
   some seeds) meant some people never existed to react to anything. Widened
   to a three-second window (mean 30), making missing the cap of ten
   vanishingly unlikely rather than merely likely enough.

**Measured, after all three fixes**: 29 of 29 seeds tried pass, worst gap
consistently ≈0.1 s — one decision tick (10 Hz) — between each of ten
people's assigned premovement time and when they actually started moving.
The tolerance (0.5 s) is self-authored; the guideline states none.

## 2026-09-22 (third entry): five more RiMEA tests built (9, 10, 11, 12, 15) — a genuine router limit found, and one honest failure kept

Following the stairs and 5/16 entries above: tests 9 (crowd leaving a large
public space), 10 (allocation of escape routes), 11 (choice of escape
route), 12 (bottleneck flow, four sub-tests) and 15 (a large crowd around a
corner) are now built. The suite reads **10 pass, 2 fail, 4 not built, of
16** — up from 6 pass/1 fail/9 not built. `runRimeaSuite` gained a single `crowdPeople` cheap
option that overrides all four crowd-scale tests' headcounts at once (they
default to the guideline's own 1000/1000/150/500), so a full unit-test run
stays under 15 seconds instead of the several minutes a full-scale run of
all five takes.

### A genuine, previously-undocumented limit in this project's own router

Tests 9, 11 and 12 all need a narrow gap in a wall — a door, an exit, a
bottleneck. Built at the guideline's own widths (test 9/11's 1 m doors,
test 12d's 0.8/1.0/1.2 m bottleneck), **nobody got through, for the full
length of a 60 s check, at any width from 0.8 to 1.8 m.** Verified directly,
not assumed: an isolated debug scene at each width, instrumented to log
which exit each agent's evacuation decision actually picked. 2.0 m was the
first width that worked.

The cause is `crowdNavigation.ts`'s routing grid, which never goes finer
than 1 m (`routeCellSizeMeters`), combined with `wallIndex.ts`'s
`forEachCellOnSegment`, which marks every grid cell a wall segment so much
as touches as blocked. Two wall segments bounding a gap at or near the grid's
own cell size can between them mark both of the gap's cells, sealing it
regardless of exactly where it sits relative to the grid — a conservative
rounding choice that is correct for a wide gap and wrong for a narrow one.

This is a real limitation of the pathfinding grid, not a choice about
physics, and it was not fixed here — fixing it would mean redesigning how
`wallIndex` marks cells near a gap, which is out of scope for "build RiMEA
test scenarios" and affects every scene in the product, not just these
tests. Instead, every affected test uses a wider gap than the guideline asks
for, and **says so in its own returned `criterion` string**, not only in a
module comment: test 9 and test 11's doors/exits are built 2.4 m wide (their
own sinks stay labelled at the guideline's 1 m width, since sinks are not
throughput-gated in this engine — only sources are, ADR-0008 — so the sink's
own declared width does not affect what is measured); test 12's bottleneck
defaults to 2.4 m everywhere, and 12d — the one sub-test where width _is_
the measured variable — moves its own three points out to 2.0/2.6/3.2 m
rather than reuse the guideline's 0.8/1.0/1.2 m, still three points testing
the same claim (flow rises with width).

### The corner (test 15) was built sealed shut, and only negative-scale testing caught it

The first version of the corner scene's `horizontal-north` wall — the inner
edge of the L-turn someone has to walk around — spanned the wall's full
nominal width (`verticalX1` to `0`), which includes the vertical leg's own
footprint. Since the vertical leg and horizontal leg share that footprint (it
is the inside of the turn, open floor), the wall as built ran straight across
the only crossing between the two legs, sealing the corner completely: a
40-person run at the scene's own scale never got a single person past
y = bandTop in a 900 s check (reported as clear time = infinity). Fixed by
stopping that wall segment at `verticalX0` — the vertical leg's own western
edge — leaving the true interior of the turn open. After the fix: same
40-person scene, clear times 61.0/68.1/95.0 s (short/corner/long,
correctly ordered); at the guideline's own 500 people, 75.3/100.4/108.0 s,
same ordering. This was caught by running the test at all, not by reading
the geometry — a reminder that "the geometry looks right" and "the geometry
lets anyone through" are different questions to check.

### The negative-coordinate clamp bug, found a third time

`clampPointToWorld` (`sceneGeometry.ts`) clamps every position to
`[0, width] × [0, height]`; a sink or wall placed at a negative coordinate
silently clamps movement back to 0 and stranded people there instead of
ever reaching it. This was the root cause behind a stuck scene in tests 9,
11 and 15 independently, each caught and fixed separately (a `margin`
offset, or shifting the whole geometry so nothing sits below (0,0)) before
it was connected as the same bug three times over. It is not fixed at the
source (`clampPointToWorld` has no way to distinguish "this scene meant to
place something off-grid" from "this scene has a coordinate bug"); every
affected test's scene builder now carries a comment naming it so a fourth
scene does not rediscover it the slow way.

### Test 11 (choice of escape route): a kept, honest failure

At the guideline's own 1000 people, the built scene measures **exit 1
(nearer, 14.5 m from the source) took 473, exit 2 (farther, 20.5 m) took
527** — the _farther_ exit got used more, not less, reversing the
guideline's own expected result ("persons prefer the closer exit… congestion
occurs… individual persons will also use the alternative"). This is not a
scene bug: `mallCrowdDecisionBackend`'s `chooseEvacuationSink` penalises each
exit's cost by `evacuationExitCrowdingMeters` (4 m, "the size of the spread
is a guess," per its own comment) for every person already committed to it,
and that commitment count never resets. With only a 6 m distance advantage
between the two exits and 1000 decisions being made over the course of the
run, it takes only a couple of people committing to the nearer exit before
its penalised cost exceeds the farther one's, and the split settles near
50/50 rather than staying lopsided toward the nearer exit. The test reports
this as `status: "fail"`, with both numbers in `measured` and the finding
explained in a code comment next to the test — kept rather than tuned away,
the same way test 4's low-density deviation stays a reported failure rather
than a widened tolerance. Recalibrating or redesigning
`evacuationExitCrowdingMeters` is a change to the product's evacuation
behaviour for every scene that uses it, not a RiMEA-scenario change, and was
left alone here.

### Test 11 also needed its step cap cut for the test suite's own stability

At the guideline's own 1000 people and the step cap used for every other
crowd-scale test (1800 s), `pnpm test` crashed the Vitest worker twice
("Worker exited unexpectedly") on runs that took 139-149 s each. Cut to 600 s
— the scene clears well inside that at 1000 people once the crowding
penalty settles the split, so nothing about what is measured changed — and
confirmed stable across a full-scale run afterward (122 s, no crash).

### Test 10, unlike the other four, needed no new fix

Built and verified without incident: 23 of 23 people across twelve rooms
each left by their assigned exit (`exitIds`), at the guideline's own
headcount, no scale-down needed for either speed or correctness.

### Disclosure the module doc already carried is now repeated where a report reader would see it

Tests 9 and 11's own `criterion` strings now name the 2.4 m routing-gap
substitution directly (previously it was explained only in a comment near
`largeRoomTest`'s definition, upstream of both tests but not visible in
either one's own result) — matching the standard test 12's criterion string
already set: a departure from the guideline's own numbers belongs in the
string a report reader actually sees, not only in the source a report reader
would have to go find.

**Suite total after this entry: 12 built, 10 pass (1, 2, 3, 5, 6, 9, 10, 12,
15, 16), 2 honest fail (4 — already recorded, low-density deviation; 11 —
this entry's crowding-penalty overshoot), 4 not built (7, 8, 13, 14).** Test
16's beyond-jam points stay unjudged rather than failed, which is a
different thing from test 4's own failure: test 16 has no comparable point
past its own corridor's jam density to fail against, while test 4's failure
is at 0.5 P/m² — well inside Weidmann's comparable range, not a beyond-jam
artifact.

## 2026-09-22 (fourth entry): lifts — a batch-service model, not a sloped walk

`connectorSchema` refused `kind: "elevator"` since ADR-0010 stage 1, with a
doc comment saying why: a lift is a queue with a batch service, and
modelling it as a staircase would produce an answer that looks reasonable
and is not. That refusal is now lifted — `elevatorTransfers.ts` gives it the
model the refusal was waiting for.

### What was built

A car has three phases (`idle`/`boarding`/`moving`), timed against the
engine's own simulated clock, not a fixed schedule. Idle, it answers a call
at its own floor for free; failing that, the first idle car (by `carCount`
order) is sent empty to the other floor — the simplest dispatch that is
still a dispatch, not the real thing (no lookahead, no load balancing across
a bank; disclosed as such in the module's own doc comment and in
`connectorSchema`'s). Boarding takes up to `capacity` people from whoever is
waiting, holds doors for `doorSeconds`, then rides for a travel time derived
from a 1.0 m/s literature-typical car speed. A rider sits inside a small
enclosed box (`elevatorCarSideMeters`, scaled off `capacity` against an
8-person car's own ~1.6 m EN 81-typical interior) — four walls, not the two-
wall corridor a stair's flight gets, and a shaft with more than one car gets
one box **per car** (`elevatorCarFloorId`), so two cars never occupy the
same physical space.

**One connector is one shaft between exactly two floors, same as before.** A
bank serving three or more floors needs one elevator connector per adjacent
pair, independent shafts and car pools rather than one car skipping a
floor — a real difference from a real bank, disclosed in `connectorSchema`'s
doc comment: a single car serving floors 1, 2 and 3 can be nearer for a 1→3
trip than two separate shafts waiting at floor 2 in between would be.

`connectorTravelSeconds`'s own number for a lift — used only for the
floor-graph's routing-cost comparison ("is upstairs nearer than the far end
of this floor"), never read by the car simulation itself — is straight
vertical rise at car speed plus two door cycles: a static estimate, not a
live wait-time prediction. `elevatorRideSeconds` derives the car's actual
`"moving"`-phase duration by subtracting the two door cycles back out of
that same number, rather than recomputing it from scratch, so the two stay
in one relationship instead of two formulas that could drift apart.

### Editor round trip

`EditorConnector` gained `capacity`/`carCount`/`doorSeconds`, threaded
through both conversion directions (`sceneEditorConversions.ts`) — round-
tripped even before this pass added a real control for them, on this
project's own established rule that an unrelated edit must not silently
revert a value the scene actually declared. A working control now exists
too: the connector kind dropdown gained "elevator", and its parameter grid
shows capacity/car-count/door-seconds in place of width/bidirectional when
that kind is selected — so a lift is not a capability that only JSON authors
could reach, the class of gap this project's own `multifloorScene.ts`
episode (2026-09-20/21) warned against building.

### Verified, not assumed

`elevatorTransfers.test.ts` (10 cases) drives the car state machine directly
at fixed simulated timestamps: doors open for someone waiting at the car's
own floor for free; a full door-to-alighting cycle at the exact
`doorSeconds`/`rideSeconds` boundaries; capacity truly caps boarding and
turns away the rest for the next trip; an idle car is dispatched empty for a
call at the far floor; two cars in one shaft get two independent boxes; a
scene with no lift connectors is a no-op. `simulationElevators.test.ts`
proves the same thing through the real scene → engine pipeline (the same
shape `simulationFloors.test.ts` already uses for a staircase, built to be
read side by side with it): arrivals on an upper floor route to the lift's
own mouth, ride down in a box addressable by `isOnShaftFlight`, and leave
through a ground-floor door, never carrying more than the car's own declared
capacity at once, and never counting a lift lobby as having left the
building.

### What still is not here

Dispatch does not look ahead or balance load across a bank; a hall call is
only re-evaluated at the moment a car's own phase ends, not continuously
while doors are open, so someone arriving mid-dwell waits for the car's next
trip rather than the one already loading. And — unchanged from every other
connector speed this project has ever quoted — nothing here is calibrated to
any real lift's throughput; this project has no observed lift flow to fit
to. See `docs/adr/0010-multi-floor-and-vertical-circulation.md`'s own
2026-09-22 update for the same account with the full ADR context.

## 2026-09-22 (fifth entry): fire/smoke — a scene-wide multiplier nobody knew was live, replaced with a local one

CLAUDE.md's own history said hazards had no simulated effect at all — "火只画在图上" (a fire was only ever drawn on the map). That was **half wrong**, discovered while building the local exposure/dose model this entry is about: `bioCityWeatherSystem.hazardToEnvironmentFactor` already converted **every** active hazard, of **any** kind, into a scene-wide `EnvironmentFactor` folded into the single `speedMetersPerSecond` the whole scene's crowd walks at (`environmentEffects.calculateEnvironmentImpact`). A fire with `speedMultiplier: 0.1` did not do nothing — it slowed **everyone in the building to a tenth speed**, uniformly, the instant it started, regardless of distance.

**Found by symptom, not by code review.** Building a corridor test scene with a small fire produced a crowd that would not move at all — not just people inside the fire's radius, everyone, including a control group standing at the far end nowhere near it. Direct comparison of `deriveSceneGeometry`'s full output between an otherwise-identical scene with and without the hazard turned up the smoking gun: `speedMetersPerSecond: 1.34` with no hazard, `0.134` with one — a 10x scene-wide drop from a single fire's own `speedMultiplier`, the mechanism above.

**Fix**: `fire`/`smoke` are now excluded from `hazardToEnvironmentFactor`'s conversion (`bioCityWeatherSystem.ts`), since they have their own localized model now (below). Every other hazard kind (`crowdSurge`, `flood`, `powerOutage`, `roadClosure`, `securityIncident`, `transitDisruption`) keeps the old scene-wide mechanism unchanged — this pass built nothing better for them, and narrowing the fix to only the two kinds that now have a real alternative was the smallest correct change.

### The local model (ADR-0012)

Full account in `docs/adr/0012-smoke-and-incapacitation.md`. In short: `smokeHazards.ts` gives fire/smoke a growing circular affected radius (`smokeRadiusAt`, linear over a new self-chosen `growthSeconds` field, default 120 s), exposure falling off linearly within it (`localExposure`, worst-of-overlapping via `mostExposingHazard`), a local speed multiplier read from the hazard's own already-existing `speedMultiplier` field (`exposureSpeedFactor`), a local steering push away from it scaled by the hazard's own `visibilityMultiplier` (`hazardAvoidancePush`, added into `crowdMovement`'s force sum rather than the router — the router's grid is not rebuilt every tick a hazard grows), and a fractional dose toward incapacitation (`fedDoseThisTick`).

**The dose model is self-authored, not Purser's.** The plan for this work asked for the literature FED (fractional effective dose) model; its exact published coefficients were not independently verified here, and reproducing them from memory without that verification would be exactly the class of claim this project's own history exists to catch. What is built instead has the same _shape_ — dose accumulates with time and severity, 1.0 is incapacitation — with a self-chosen anchor (`doseSecondsAtFullExposure = 180`) the code and the ADR both say plainly is not a citation.

**Incapacitation is permanent and honestly excluded from having "escaped"**: past a dose of 1, a person is pinned where they stand, skipped by the decision backend (mirroring how a mid-flight stair rider is already skipped), and `isExitBound` refuses to count them as having left no matter where they froze. `SimulationSnapshot.incapacitatedCount` reports the live count.

**A real dynamic the test suite had to work around, not paper over**: with any nonzero speed multiplier, a person's own small movement reduces their exposure slightly, which raises their speed slightly, which reduces exposure further — a real feature of the model (visibility improves as you near a fire's edge, so you move a little faster, which is not wrong), but it means an open corridor lets even a very slow person eventually walk clear of a fire well short of the ~180 s of full exposure incapacitation needs. `simulationSmoke.test.ts`'s incapacitation cases seal someone into a small walled box with the fire instead of relying on slowness alone to keep them there — the test's own comment explains why, rather than silently picking parameters that happened to work.

### Editor

The hazard param panel gained `growthSeconds` and — present in the mutation type since before this pass but never actually reachable from the panel — `visibilityMultiplier`, both round-tripped through `EditorHazard`/`sceneEditorConversions.ts`/`sceneEditorAdders.ts`, plus a disclosure line shown only for `fire`/`smoke`: "示意性烟气，非 CFD" and what that means concretely (no gas transport, buoyancy or venting; a circle, not a smoke layer).

### Verified

`smokeHazards.test.ts`, 20 cases, pure-function coverage of the radius growth clamp, the falloff shape, `mostExposingHazard` correctly preferring the worse hazard over the nearer one, and the dose formula's own arithmetic against its stated anchor. `simulationSmoke.test.ts`, 8 cases, through the real scene → engine pipeline: local-only slowdown, dose accumulation, a genuine incapacitation (sealed-box scenario), the incapacitated-never-exits guard, the avoidance push's direction, and a no-hazard control scene proved bit-for-bit unaffected. 774 vitest tests total, cargo test, typecheck, lint and prettier all clean.

## 2026-09-22 (sixth entry): parameter sensitivity — Morris screening, off the main thread

The last of the three item-④ sub-parts this session's user ordered (electric lift, fire/smoke, then this): "which parameters actually determine the outcome" for this project's own social-force model, cheaply — Morris (1991) elementary-effects screening, not a full factorial or a fitted surrogate.

### What was built

`sensitivityAnalysis.ts` is a generic implementation of the method — `generateMorrisTrajectories` (randomized one-at-a-time trajectories over a discretized grid, the same construction Morris's own B* matrix produces, written iteratively), `computeElementaryEffects` (output change ÷ parameter change, read directly off two trajectory points), `summarizeMorrisEffects` (μ*/μ/σ per parameter, ranked by μ\* descending). None of this is a fitted or approximated version of the method: "Morris (1991)" here names the actual algorithm running, unlike this project's several self-authored constants elsewhere that explicitly say they are not a citation.

**Verified against known ground truth, not just internally consistent.** `runMorrisScreening` was tested against synthetic functions with a known sensitivity ranking — a parameter the function is linear in scored μ*=5 exactly and ranked first; a parameter it does not depend on at all scored μ*=0 and ranked last; a parameter with a genuine interaction (`x*y*10`) showed a nonzero σ, distinguishing "moves the metric" from "moves it in a way that depends on something else too". This is the same kind of verification this project used for RiMEA test 1's spread-vs-window finding and the bootstrap-CI coverage check in M6 — prove the tool against a case where the right answer is already known, not just that it runs.

**A concrete application to this product**: `runSocialForceSensitivity`/`defaultSocialForceScreeningParameters` screens six of `crowdMovement.socialForceParameters`'s own fitted constants (relaxationSeconds, agentStrength, agentRangeMeters, anisotropy, wallStrength, sidestep) at ±50% of their fitted value, against a scenario's throughput. This needed one small piece of previously-missing engine plumbing: `SimulationEngineConfig` gained `movementParameters?: Partial<SocialForceParameters>`, threaded to `stepCrowd`'s own `parameters` argument — which already existed and was already documented as "Overrides for the model parameters (calibration)" but was never actually wired up from the engine's public config before this. Confirmed against `HEAD` before writing it: dead plumbing, not a duplicate of existing wiring.

### Off the main thread, per this project's own established rule

`ExperimentSweepPanel`'s own history records that it used to run a sweep synchronously and freeze the page. `SensitivityPanel.tsx` does not repeat that: `buildMorrisExperiment` turns each trajectory point into one `ExperimentVariant` (`replications: 1` — Morris's own trajectory sampling already spreads the randomness, not repeats of one point) and runs the whole thing through the existing, unmodified `runExperimentInBackgroundWorker`/`experiment.worker.ts` machinery; `summarizeMorrisExperimentResults` reconstructs the ranking client-side once results return, matching each one back to its trajectory and point by id. The panel is registered in `panelRegistry.tsx` (id `sensitivity-screening`) and covered by the existing render-smoke test pattern (`panelRegistry.experiments.test.tsx`) and the dock's generic fixture-labelling/reachability tests — reachable, not built and left an orphan, the exact class of gap this project's own history (the M6 background worker, several panel-registration passes) has repeatedly had to go back and fix.

### One finding from this session's own review, applied

Ponytail-review of this diff found `MorrisOptions.levels` (the method's own discretization parameter, Morris's p) was never actually varied from its default anywhere — not in production code, not in any test. Removed as a public option; fixed at 4 (the literature's own common choice) as an internal constant instead, with the reasoning kept in its own comment. Confirmed harmless: the one test that had explicitly passed `levels: 4` was already passing the default value under a different name.

### What this is not

A screening, not a full sensitivity study: it ranks parameters by how much they move the metric, not by what share of the output's variance each one explains — that is Sobol indices, a different and considerably more expensive method, not built here. The screened range (±50% of each constant's fitted value) is this pass's own choice for "wide enough to see an effect", not a claim about a plausible real-world calibration range.

787 vitest tests (12 new for `sensitivityAnalysis.ts`, plus the new panel's render-smoke coverage), cargo test, typecheck, lint and prettier all clean. One pre-existing test (`simulationFloors.test.ts`'s "gets people out of a door on a floor they did not arrive on") needed its timeout raised from the 5000 ms default to 30 000 ms — measured flaking under full-suite CPU contention this session's own heavier test files made more likely, not a logic change; it passes in under 2.3 s standalone.

## 2026-09-22 (seventh entry): RiMEA tests 7 and 8 built — and a real deadlock in the multi-floor connector model found and fixed along the way

The user's own instruction for this piece of work: go get the RiMEA guideline's Fig. 3 and Fig. 7 data directly, rather than leave tests 7 and 8 sitting in `needs-scenario` waiting for someone to hand-transcribe them. Downloaded the official RiMEA 4.1.1 PDF (rimeaweb.wordpress.com, the guideline's own distribution mirror) with the user's explicit authorization after a save-dialog first blocked in-browser viewing, then read the two figures at 400 DPI (`pdftoppm`) rather than off the Read tool's lower-resolution default PDF rendering — precise enough to count rooms and read gridlines with confidence, the same discipline this project's own history (the "2m/1m door mark" misreading, caught and corrected mid-session weeks ago) says is worth the extra step.

### Test 7: a translation typo caught, and a point chosen off a continuous curve

RiMEA's own English column sends test 7 to "Figure 2" for the age-speed distribution it asks a tester to draw from; the German original (authoritative per the document's own preamble) says "Abb. 3". Checked directly: Figure 2 (p. 11) is an unrelated diagram of evacuation-time components, and Figure 3 is the guideline's only age-speed curve — so this reads as a translation slip in RiMEA's own document, not a second data source, and Fig. 3 is what test 7 uses. Table 2 (p. 14), the other candidate this session considered before opening the actual PDF, turned out on inspection to be a single-row table for "persons with impaired mobility" (0.46-0.76 m/s) that no test in Annex 1 actually cites by number — not an alternative reading of test 7 at all.

Fig. 3 is continuous (v_mean and v_mean±sigma against age, 3 to 90), not one group, so a point had to be chosen: age 30, a round age on the plateau between the steep 10-20 climb and the post-50 decline, away from the sharp peak near 20 where a small misreading swings the mean the most. Read off the curve's own gridlines at 400 DPI: v_mean ~= 1.52 m/s, half-widths of 0.31/0.33 above/below (agreeing with the same half-widths read at age 20, giving confidence in the reading) — sigma ~= 0.32 m/s from the figure. Rather than write a second, one-off Gaussian sampler for this one test, `runDemographicSpeedTest` (`rimeaSuite.ts`) reuses the engine's existing per-agent speed spread (`sampleSpeedFactor`, a fixed 19.4% of whichever mean a scene declares — the same mechanism every other test in the file already walks through), which at 1.52 m/s gives sigma ~= 0.295 m/s — close enough to the figure's 0.32 that reusing existing, tested machinery over new untested machinery was the right call, disclosed in the criterion string rather than silently assumed.

Fifty people, each walked test 1's own corridor alone (a person with nobody nearby is what "free walking speed" means), their realised speed (length / travel time) standing in for "the distribution of walking speeds in the simulation". Judged the way this project's own bootstrap tooling already judges a sweep (`bootstrapMeanInterval`, gap-closure plan 1.3, not new code): the figure's mean passes if it sits inside the 95% bootstrap interval of the 50 realised speeds' own mean. Measured: mean 1.495 m/s, sd 0.257 m/s, interval [1.423, 1.567] — contains 1.52. **Pass.**

### Test 8: the real building, and three real bugs the real building exposed

Fig. 7's three-storey plan, counted row by row off the 400 DPI render: ground floor rows of 9/8/8/11 rooms (144 people), 1st and 2nd floor rows of 11/8/8/11 (152 people each), 448 in total, room 2 m x 3 m, a stair ground<->1st and 1st<->2nd, one exit. `parameterStudyTest`/`parameterStudyScene` (`rimeaSuite.ts`) build it. Two disclosed simplifications, both in the scenario's own doc comment and its criterion string: rooms are open three-sided alcoves rather than doored cells (Fig. 7's own 1 m door in a 2 m room is the same 1 m gap tests 9/11/12/15 already found this project's 1 m routing grid cannot resolve, and widening it to the router's working minimum would make a door wider than its own room); and the connecting path from each floor's two corridor bands to its stair or exit is one corridor along the building's east edge, a simplified reading of Fig. 7's own jogged connection past the stairwell. The test itself is RiMEA's own worked example — vary the population's speed (0.5/0.75/1.0 m/s), report total clear time — since the guideline's own text asks for this to be "recorded in graphs" with no pass/fail bound, and its _second_ case (same mean, wider spread) has no matching scenario-level knob in this engine (the per-agent spread is a fixed process-wide constant, not a per-scenario setting — see the test's own doc comment for the full reasoning, the same reasoning test 7 above leans on from the other direction).

Building this at real scale (448 people, two stairs each carrying up to 152) is what found the bugs — a 48-person version of the same building ran clean in 1.5 s; a 192-person version deadlocked at the full 1800 s step budget on every one of the three speeds, never clearing. Investigated by direct agent-state inspection (dumping position/velocity/target for everyone on a stuck flight lane) rather than guessing, and found three real problems in `floorTransfers.ts`'s connector-traffic model, previously untested at this scale because tests 2/3/13's own headcounts never approached it:

1. **`ConnectorTraffic.board` rate-limits admission, not occupancy.** A stair's downstream flow slows as the lane itself gets crowded (a crowded flight is a slower one), but admission does not slow with it — so occupancy climbs without bound. A whole floor's population funnelling onto one 2 m stair packed a 16 m² flight to 5.8 people/m², above Weidmann's own 5.4 jam density: more people than the space this project's own geometry says can physically fit. Fixed with a `flightCapacity` occupancy cap in `stepConnectorTravel`, checked before `traffic.board` — but capped at jam density itself first, which just reproduced the same freeze one density lower (jam density is where the curve has _already_ reached zero speed). Recapped at `weidmannMaxSpecificFlowDensityPerSquareMeter` (~1.75 P/m², newly exported from `pedestrianFundamentalDiagram.ts` — the density `weidmannMaxSpecificFlow` already computed internally but never named), the point throughput actually peaks, not the point it has already died.
2. **Every rider on a flight aimed at the exact same departure point.** Boarding already spreads people across the flight's width (`boardingLateralMeters`, a golden-angle scatter keyed by id); departure did not — `targetY` was hardcoded to the flight's centreline for everyone. With enough riders on a lane at once, that is a crowd converging on one shared pixel, which can itself jam solid right at the exit. Fixed by giving each rider their own lateral target — the same `boardingLateralMeters` call, so a rider aims for the lateral offset they boarded at.
3. **The arrival check measured 2D distance, not progress along the flight.** Whether someone has crossed a stair is a question about its length, not its width — but the old check compared full distance to `(targetX, targetY)`, so a rider nudged sideways by neighbours (this project's own crowd model doing exactly what it should) could have fully crossed in x and still fail the check by a few tenths of a metre of y, permanently, once nothing on a jammed lane was moving enough to close that gap. Fixed by gating arrival on x alone.

All three needed together: capping occupancy without the other two still jammed (fix 1 alone still froze at t~=90s); the target-spread fix reduced how often riders drifted but a handful still could, at scale, catch the wall exactly as their own lateral position and the crowd behind them both stopped mid-correction. With all three, the 192-person building clears in 15.6 s of test wall-time (240.6/140.2/109.9 s of simulated clear time at 0.5/0.75/1.0 m/s — monotonic, the correct direction); the real 448-person building clears in 76.7 s of test wall-time (466.4/283.3/254.1 s simulated, same monotonic order). **Pass.**

New regression coverage for the fix itself, not just for test 8 passing: `floorTransfers.test.ts` gained a case that fills a flight to its own computed capacity and shows a further boarder is refused even with ample rate allowance to spare (proves the occupancy cap independently of the rate limiter), and a case that places a rider whose `y` is deliberately off their own `targetY` by more than the arrival radius and shows they still step off once they have crossed in x (proves the fix directly, not just its downstream effect on test 8's own pass/fail).

### Suite status

16 conditions: 14 built (1-12, 15, 16), 2 not built (13, 14 — both still blocked on a stairs-crowd-can-stand-on scenario or an undimensioned figure, unrelated to this entry). `runRimeaSuite` gained a `parameterStudyRows` cheap-override (mirroring the existing `crowdPeople` knob for tests 9/11/12/15) so the unit-test suite exercises test 8's real code path at a small scale rather than the full 448-person building on every run.

792 vitest tests, cargo test, typecheck, lint and prettier all clean.

## 2026-09-22 (eighth entry): RiMEA test 13 built — and a correction to this session's own earlier claim about its reference figure

This session's own prior entry (the "stairs a crowd can stand on" one, same day) recorded test 13 as blocked partly on "Fig. 16, a shaded speed-density band read off a real test with no printed table" — that description was written from memory of an earlier, lower-resolution look at the guideline, not from actually reading the chart. Re-reading it at 400 DPI (the same PDF this session already had, pp. 42-43) found a perfectly readable shaded band with printed gridlines — not data-less at all, just not a printed table of numbers. Digitised the same way test 7 already digitised Fig. 3's curve: read the band's upper and lower edges off the gridlines at density 0.6, 0.8, 1.0, 1.2, 1.4 and 1.5 P/m^2, for both the "upwards" and "downwards" panels (`stairCrowdBand`, `rimeaSuite.ts`), with `stairCrowdBandAt` interpolating linearly between the points and returning null outside that domain. This is the second time this session corrected an earlier claim about RiMEA's own figures by going back and actually looking (the first being the Fig. 2/Fig. 3 mistranslation test 7 caught) — worth naming as a pattern: a description of a figure written from memory or a first pass is not the figure, and the fix each time was the same, go look again at higher resolution before writing the blocker off as unbuildable.

### The scenario

Fig. 17's own setup: a 10 m x 10 m room of 100 agents, a stair whose _horizontal projection_ is 5 m long and 2 m wide (2 m level approach on each end), and a goal past it — built once climbing, once descending, by swapping which of two floors holds the room and which holds the goal (the same technique `stairSpeedScene`, tests 2/3, already uses). The connector's own rise is chosen so its 30 deg pitch (this project's fixed `connectorPitchDegrees`) gives exactly a 5 m horizontal run: `rise = horizontal * tan(30 deg)`. Density and speed are sampled every second over the stair's horizontal projected area (5 m x 2 m = 10 m^2) — not the slope length tests 2/3 measure a single walker's speed along, because that is what Fig. 16's own axes are defined against.

### Two things found building it, both disclosed rather than tuned around

1. **A single-sample density bin is a mean of noise, not of the flow.** The direction check ("is descending faster than climbing at the same density") originally binned samples to 0.1 P/m^2 and compared means; one bin — the very start of the run, one or two pioneers reaching the stair before the rest of a 100-person crowd caught up — had one sample on each side, and this project's own 19% per-agent speed spread flipped that single comparison the "wrong" way, failing the whole test on a comparison that was never meaningful to begin with. Fixed two ways, both disclosed in the criterion string: bins widened to 0.2 P/m^2 (Fig. 16's own gridline spacing, so a bin actually collects more than a sample or two from a density trajectory that is sweeping through rather than sitting still), and a bin only counts toward the comparison once both runs sampled it at least 3 times (`minSamplesPerBin`, this test's own choice, not a value RiMEA gives).
2. **The two reference bands' upper edges are not cleanly ordered at this digitisation's own precision.** Read closely, "descending faster than climbing" holds cleanly for the _lower_ edge of each band at every gridline (this project's own reading), but the _upper_ edges visually converge and, at the domain's own far end (1.5 P/m^2), cross by 0.01 m/s in this reading — well inside the error of reading a printed chart by eye. `rimeaSuite.test.ts`'s own regression only asserts the lower-edge ordering for exactly this reason, with a comment saying why the upper edge is not asserted the same way, rather than rounding the two apart to make a cleaner-looking test pass.

### Judged, not just built

Majority (not all — the guideline's own text calls its reference data "widely spread") of in-domain samples fall inside Fig. 16's digitised band in each direction, and the descending run is faster than the climbing one at every density bin both runs sampled enough to compare. Measured: up 102 samples (7/8 in-domain inside the band), down 88 samples (13/13 inside), descending faster at 3/3 compared bins (0.9, 2.0, 2.1 — wider bins than the raw density values pooled several nearby samples into) — **pass**. The whole run (both directions, 100 agents each) takes about 4 seconds of test wall-time; no cheap-scale override was needed the way test 8's 448-person building needed one.

Suite now reads 15/16 built — only test 14 (Fig. 18, an undimensioned isometric schematic) remains, for a reason unrelated to this entry.

794 vitest tests (2 new for test 13, one exercising `stairCrowdBandAt` directly, one running the full scenario), cargo test, typecheck, lint and prettier all clean.

## 2026-09-22 (ninth entry): ORCA — a comparison layer, not a second movement model

Gap-closure plan batch 3.1: a second, well-known collision-avoidance algorithm run on this project's own benchmarks, producing a difference table against social force. Full account in `docs/adr/0013-orca-comparison-layer.md`; this entry records the decision to self-implement rather than bring in RVO2 (a C++/WASM build target this repo does not carry, for an algorithm whose core is a few hundred lines) and the actual numbers.

### What was built

`orcaAvoidance.ts` implements ORCA (van den Berg, Guy, Lin & Manocha, 2008) faithfully for the part that matters — per-pair half-plane constraints (both the approaching-but-not-colliding case, with its time-horizon truncated cone, and the already-overlapping case, with its shorter escape-line horizon) and the paper's own incremental 2D linear program (`linearProgram1`/`linearProgram2`, ported from the reference algorithm and RVO2's own implementation of it). **One deliberate scope cut, disclosed in the ADR and in the code's own comment**: RVO2's `linearProgram3` — a full feasibility relaxation across every constraint when none of them can be jointly satisfied — is not built. In its place, when a single constraint's own escape velocity exceeds the max-speed disc entirely, the solver moves at full speed toward that constraint's feasible side rather than returning the unconstrained candidate unchanged. That second choice was not academic: the first version _did_ return the unconstrained candidate, and a unit test of two already-overlapping, zero-velocity agents got back zero — the ORCA analogue of the exact flight-lane freeze `floorTransfers.ts` was fixed for earlier this same day (an occupancy-cap fallback that gave up instead of pushing through). Same shape of bug, same session, independently discovered in a completely different algorithm, because the underlying failure mode — "when a constraint can't be perfectly satisfied, silently do nothing" — recurs anywhere a solver has a bail-out path.

**Walls are not ORCA obstacles.** `stepCrowdOrca` reuses this project's own `constrainMovement` (the same hard wall clip `stepCrowd` already applies) rather than building ORCA's own line-segment obstacle handling. Disclosed as a real cut, not a hidden one: a scene where the _only_ way through is a gap ORCA's agent-agent constraints alone cannot resolve is not exercising ORCA's own obstacle behaviour in that regime. None of the three benchmarks below depend on it.

### The comparison (`orcaComparison.ts`), against benchmarks that already existed

Fundamental diagram (`measureCorridorSpeedOrca`, the same periodic-corridor technique `measureCorridorSpeed` already uses, calling the _unmodified_ function for the social-force side — a test asserts the two give literally the same number for the same input, so this comparison cannot have quietly forked social force's own measurement):

| density (P/m²) | social force (m/s) | ORCA (m/s) |
| -------------- | ------------------ | ---------- |
| 0.5            | 1.255              | 1.334      |
| 1              | 1.085              | 1.270      |
| 2              | 0.699              | 0.590      |
| 3              | 0.291              | 0.224      |
| 4              | 0.037              | 0.081      |

Both models show the right qualitative shape (speed falls as density rises); they diverge more as density climbs, and cross order at the top of the range — at 4 P/m² ORCA is _faster_ than social force, the two models handling extreme crowding differently, not one being "more correct" (neither is fitted to real trajectory data at all, and social force's own fit was to Weidmann's curve, not to this exact scenario).

Bottleneck specific flow (`measureBottleneckFlow`, `bottleneckTest`'s own room/headcount/2.4 m gap geometry, at the lightweight `stepCrowd`/`stepCrowdOrca` level rather than through the full scene schema): social force 1.58 people/s/m, ORCA 1.42 — both in the neighbourhood of Weidmann's own peak specific flow (1.22, `weidmannMaxSpecificFlow`), consistent with a doorway this size not being the tightest possible constraint in either model.

Passing distance (`measurePassingDistance`, the exact 20 m/0.1 m-offset head-on setup `crowdMovement.test.ts`'s own `headOnPassing` already uses): social force 0.534 m — matching this project's own previously-recorded measurement for that setup almost exactly — ORCA 0.460 m, passing noticeably tighter.

### What this is not

A snapshot, not a standing gate: nothing re-runs this comparison, and nothing fails a build if the numbers drift. Not a calibrated comparison: `orcaParameters` are the ORCA literature's own typical defaults, not fitted to anything, while `socialForceParameters` is fitted to Weidmann's curve — so "which model matches Weidmann's default behaviour better" is answerable from the table above, "which model is more accurate" is not, for the same reason this project's other model-comparison work (`docs/calibration/`) already states its own parameters are not unique. Not wired anywhere: `crowdMovement.ts`, `simulationEngine.ts`, the scene schema and the editor are byte-for-byte unchanged; there is no in-app way to run a scene "on ORCA". "Into the report" (the plan's own acceptance line) is this entry, with real numbers, not a new printable UI section — that would be separate, larger work this pass did not attempt.

12 new tests (`orcaAvoidance.test.ts`, 7: the LP solver's behaviour on an unconstrained case, a symmetric head-on deflection, the overlapping-pair escape fallback, and a max-speed cap; `orcaComparison.test.ts`, 5, including the "matches the unmodified harness exactly" regression). 806 vitest tests total, cargo test, typecheck, lint and prettier all clean.

### This session's own review, applied

Ponytail-review of this diff found four things, all fixed before commit: `directionOpt`, a parameter threaded through both LP functions for a mode (RVO2's own distance-maximizing solve, used only by its `linearProgram3`) this module never calls with `true` — removed, along with its dead branches. `OrcaLine` was exported with no reference outside its own file — dropped to a module-private type. `OrcaStepInput.parameters` (a per-call override of `orcaParameters`) had no caller anywhere in this diff — removed until something needs it. The largest: `measureCorridorSpeedOrca` had re-implemented `fundamentalDiagramHarness.ts`'s own periodic-corridor loop almost line for line, differing only in which step function ran it — `runPeriodicCorridor` is now that loop, exported once, with `measureCorridorSpeed` (social force) and `measureCorridorSpeedOrca` (ORCA) as thin callers supplying their own step closure. Confirmed behaviour-preserving two ways: the existing `fundamentalDiagramHarness.test.ts`/RiMEA suite tests (which exercise `measureCorridorSpeed` through `runFundamentalDiagramTest`/`runOneDimensionalFundamentalDiagramTest`) still pass unchanged, and the comparison table's own numbers (reproduced above) came out bit-for-bit identical before and after the refactor.

## 2026-09-22 (tenth entry): Moussaïd's heuristic — a third comparison model, and a real interpenetration bug it found and fixed before its own numbers were recorded

Gap-closure plan batch 3.2, same shape as ORCA (ADR-0013): a third movement model — Moussaïd, Helbing & Theraulaz, "How simple rules determine pedestrian behavior and crowd disasters", PNAS 2011 — added to the _same_ comparison harness (`orcaComparison.ts` gained a `moussaid` column, not a forked third file) rather than a second production model. Full account in `docs/adr/0014-moussaid-heuristic-comparison-layer.md`.

### What was built

`moussaidHeuristic.ts` implements the paper's own direction-choice rule (its equation 1) faithfully: for candidate directions swept across a field of view centred on the goal direction, an exact ray-vs-circle/ray-vs-segment `visibleDistance` measures how far the walker could go before something blocks them, and the chosen direction is the one minimising the law-of-cosines "detour" distance — walk that far, then straight to the goal. Desired speed eases down with how much room the chosen direction actually has, the same exponential-relaxation shape this project's own social force already uses for its own desired velocity. `fieldOfViewDegrees` (170°), `angleStepDegrees` (5°) and `maxSightMeters` (10 m) are this project's own reasonable readings of a paper that does not state exact numbers, disclosed as such rather than presented as literature-precise.

### A real bug, found the same way the ORCA and floor-transfer ones were — by actually running the benchmark at scale

Building the bottleneck benchmark (150 people through a 2.4 m gap) surfaced centres up to 0.5 m _inside_ their own combined radius, and a specific-flow reading of 3.78 people/s/m — three times Weidmann's own empirical peak (1.22). Root cause: the direction-choice rule picks every agent's heading from a shared snapshot taken before anyone moves that step, so at high density enough agents choose paths that converge in the same step, and — unlike social force (a contact push) or ORCA (a linear program that makes overlap structurally impossible) — this heuristic has no mechanism of its own to stop that from becoming literal interpenetration. Fixed with `separateOverlaps`: three passes of pairwise penetration correction over the proposed positions, before the wall clip, each pass pushing any still-overlapping pair apart by half the overlap each. Confirmed directly: worst-case interpenetration dropped from 0.5 m to about 0.04 m — a 12x reduction, not an exact fix, and the module's own doc comment says so. Bottleneck specific flow after the fix: 0.92 people/s/m, now _below_ Weidmann's peak rather than triple it.

This is the second time in this same session that "a solver or a choice rule computed from a shared snapshot, then everyone moves at once" produced real interpenetration that a naive implementation let stand — the first being ORCA's own `linearProgram2` fallback (this entry's predecessor), and before that, the genuinely different failure mode of `floorTransfers.ts`'s occupancy cap. Different mechanisms each time (a solver's bail-out path, a direction heuristic's shared-snapshot assumption, a rate limiter blind to occupancy), same underlying lesson: a model that looks correct in isolation can still let a crowd overlap or deadlock once enough agents interact in the same discrete step, and the only way to know is to actually run it at the scale where that happens, not read the algorithm and assume.

### The three-way comparison, after the fix

Fundamental diagram (0.5–4 P/m²): social force 1.25/1.09/0.70/0.29/0.037 m/s, ORCA 1.33/1.27/0.59/0.22/0.081 m/s, Moussaïd 1.21/1.02/0.77/0.48/0.24 m/s — all three now decline cleanly and monotonically with density (before the fix, Moussaïd's own curve was non-monotonic and implausibly high in the middle of the range, an artefact of the same interpenetration). Bottleneck specific flow: social force 1.58, ORCA 1.42, Moussaïd 0.92 people/s/m. Passing distance: social force 0.534 m, ORCA 0.460 m, Moussaïd 0.543 m (unaffected by the fix — only two agents, no dense crowd to interpenetrate).

### What this is not

Same disclosures as ADR-0013's ORCA layer, for the same reasons: a snapshot, not a standing gate; parameters are this project's own readings of the paper, not fitted to anything; nothing wired into `simulationEngine.ts`, the scene schema or the editor.

12 new tests (`moussaidHeuristic.test.ts`, 11: `visibleDistance` against known ray-vs-circle/ray-vs-segment geometry, the direction choice pointing at an unobstructed goal and deviating around a direct obstacle, a lone walker's exit and forward progress, and a wall never crossed; `orcaComparison.test.ts` gained 1, exercising `measureCorridorSpeedMoussaid`'s own qualitative shape and extending the three-model shape assertions).

### This session's own review, applied

Ponytail-review of this diff found three things, all fixed before commit. Two duplications with ORCA's own already-committed module, both extracted into a new shared `crowdStepUtils.ts`: the exit-distance filter loop (`splitExitedAgents`) that `stepCrowdOrca` and `stepCrowdMoussaid` had each written out identically — `stepCrowd`'s own social force keeps its version inline instead, for the documented performance reason that loop already states, so this sharing is between the two comparison models only, not a third copy into the production path; and the neighbour-distance query (`agentsWithinDistance`) both `nearestNeighbors` (ORCA, which goes on to rank and cap the count for its linear program) and `neighborCircles` (Moussaïd, which does not cap — ray casting is O(neighbours), not a per-neighbour LP line) had each re-filtered and re-computed. The third: a dead `maxSpeedRatio` parameter and its `maxSpeed` clamp — algebraically inert, since `Math.min(maxSpeed, freeSpeed, sight / relaxation)` always resolves through `freeSpeed` once `maxSpeedRatio > 1`. Confirmed behaviour-preserving: `runOrcaComparison`'s own numbers (reproduced above) came out bit-for-bit identical before and after: 3 new tests for the shared module, 821 vitest tests total, cargo test, typecheck, lint and prettier all clean.

## 2026-09-23 (first entry): trajectory calibration against real ETH pedestrian data — a real cross-check, and the answer is "don't adopt it"

Gap-closure plan batch 4.1. The 2026-09-14 fundamental-diagram calibration report's own "Limits" section named the gap directly: "A published curve, not trajectories. No measured pedestrian trajectories were used," and flagged that a second observable was needed to properly judge parameter sets that fit the density curve equally well. This closes that gap with real data — dated 2026-09-23 here because that is when it was written up and committed, though the underlying report/JSON files carry a 2026-09-22 date stamp from when the calibration test itself was actually run, the session having crossed midnight in between.

### Getting the data, with explicit authorization at each step

Jülich's own trajectory database (ped.fz-juelich.de) returned HTTP 500 on two separate requests — a server-side outage, not something fixable here. The user was asked, via this repo's own "download requires explicit permission" rule, to choose a path forward; they chose to pick a dataset and authorize a download in the same turn, then — after being shown the specific candidate (ETH pedestrian dataset, Pellegrini et al., ICCV 2009, 114KB, mirrored in Stanford ASL's Trajectron++ GitHub repo, with the disclosure that the mirror repo's own MIT licence covers its code and was not independently verified to extend to the underlying academic dataset's own terms) — explicitly authorized that specific file. Full provenance, format and the licence caveat are recorded in `docs/calibration/data/README.md` alongside the data itself.

### Method: real accelerations, not a simulated rollout

`trajectoryCalibration.ts` fits the same four parameters the 2026-09-14 density-curve fit uses (relaxation time, social strength, social range, anisotropy) by one-step acceleration matching: at each moment a real pedestrian has a real velocity both just before and just after, `predictedAcceleration` — a direct port of `crowdMovement.ts`'s own repulsion formula — predicts an acceleration from that person's _actual_ position, velocity, and their _actual_ neighbours' _actual_ positions at that same frame, never from a simulated forward rollout that could drift from the data. Walls (none in this open-space scene), anticipation and sidestep (neither is one of the four parameters the existing fit calibrates either) are excluded and disclosed, not silently approximated, so the two calibrations stay comparable. The search itself reuses, rather than duplicates, the existing solver: `fundamentalDiagramFit.ts`'s private Nelder-Mead loop was extracted into a new shared `boundedNelderMead.ts` this same session, confirmed behaviour-preserving and exercised by two real call sites (this session's own ponytail-review confirmed the extraction was mechanical, not speculative, and found no other issues in the diff).

### The result: real tension between the two calibration targets, not agreement

Fitted on 4,772 usable (pedestrian, frame) samples from the one available ETH scene. Two of the four parameters — social strength A and anisotropy λ — converged to the exact edge of their own search bounds (A to 0.3, its floor; λ to 0.05, its floor), not an interior optimum, while trajectory-prediction RMSE barely moved for that large a parameter swing (hand-picked 8.369 m/s², the existing fundamental-diagram fit 8.349, the new trajectory fit 8.242 — about 1.5% better for A moving 6.5x and λ moving 5.7x): the acceleration-matching cost is close to flat along those two directions in this data. More importantly, cross-checked the other way, **the trajectory-fitted parameters make the density-curve fit distinctly worse** — 0.203 m/s RMSE against Weidmann's curve, versus 0.104 for the existing 2026-09-14 fit and 0.162 for the pre-2026-09-14 hand-picked values it replaced. A parameter set that satisfies one observable measurably worsens the other.

This does not resolve the 2026-09-14 report's own "not identifiable from this curve alone" finding by picking a winner — it makes the same underlying non-uniqueness concrete with real data instead of a second synthetic search, and shows the two observables (a density-speed curve from a dense, flowing corridor; single-step accelerations from a comparatively open outdoor scene) genuinely disagree about where the model's parameters should sit. The full report, including a stated-as-a-reading-not-a-proof hypothesis for why (ETH is an open, mostly-uncrowded scene; a repulsion strength tuned to reproduce dense-corridor Weidmann behaviour may simply be stronger than everyday open-space walking calls for) and a "Limits, stated plainly" section (one scene not the full ETH/UCY corpus, no wall data, a single representative body radius, whole-track net displacement standing in for desired velocity, anticipation/sidestep excluded from the predicted-acceleration formula), is `docs/calibration/2026-09-22-trajectory-calibration.md`; the raw search log and full numbers are in the JSON alongside it.

### What this is not

**No change to `socialForceParameters`.** The trajectory-fitted values are not adopted — two of the four sit at a search-bound edge rather than a genuine optimum, and the full set measurably worsens the fit this project actually calibrates its benchmarks against. This entry records a real, disclosed finding about parameter non-uniqueness, not a new default. Not a resolved question: the honest conclusion is that this project's social-force model, calibrated the way it currently is, cannot simultaneously match both a published dense-crowd density curve and real single-step accelerations from a comparatively open real-world scene with one set of four numbers — and no further statistical machinery (Bayesian calibration, GP surrogates, differentiable-simulation gradients — all named as later options in the gap-closure plan) was reached for to paper over that, because the finding itself is the useful, honest result of this batch.

19 new tests (`boundedNelderMead.test.ts`, 3; `trajectoryCalibration.test.ts`, 12, covering ETH row parsing, sample-building including neighbour-frame matching and short-track rejection, the ported acceleration formula's physical correctness — zero acceleration at desired velocity, correct pull direction, correct push-away from a close neighbour, correct range cutoff — and RMSE/fit plumbing; `trajectoryCalibration.calibration.test.ts`, 1, opt-in behind `CALIBRATE=1` following the same gate `fundamentalDiagram.calibration.test.ts` already established). 836 vitest tests total, cargo test, typecheck, lint and prettier all clean.

## 2026-09-23 (second entry): real observation data ingress — a plain count comparison, explicitly not the data assimilation it is a prerequisite for

Gap-closure plan batch 4.2. The plan's own text is blunt about scope: CSV import of real turnstile/camera line counts and POS receipt timestamps, compared against this project's own simulated analytics, described as "the prerequisite for digital-twin data assimilation (particle filter / EnKF)" — not that assimilation itself. This entry is that prerequisite, nothing more, and says so in the module's own doc comment as well as here.

### What was built

`realObservations.ts` parses two real-world formats and compares each against `runAnalytics.ts`'s own measured output. Line counts (`parseLineCountObservationsCsv`) use the exact column shape this project's own `flows` CSV export already produces (`line_id,line_name,minute_start_s,forward,backward`) — a real dataset can be authored by editing that export's own numbers — plus tolerance for common turnstile/camera export aliases (`in`/`out`, `gate_id`, `timestamp_s`, etc.). `compareLineCounts` matches by line id, falling back to name (a hand-authored real dataset will not know this scene's internal ids), per minute; a minute present on only one side keeps that side's numbers and leaves the other `null` rather than treating a gap as a zero — the difference between "nobody recorded this minute" and "nobody crossed", which `summarizeLineCountComparison` respects by excluding one-sided minutes from its mean-absolute-error term rather than scoring them as a miss. POS receipts (`parseReceiptTimestampsCsv`, `comparePosReceipts`) are deliberately scoped to whole-run transaction totals per place against the run's own whole-run `service`-visit totals — not a per-minute comparison, because `runAnalytics.ts` has no per-minute service-completion series to compare against, and inventing an average to fill that gap would read like more precision than exists. Both are disclosed as such in the module's own doc comment, not discovered by a reader digging into the code.

A new panel, `RealObservationsPanel.tsx`, sits permanently in the "live analytics" sidebar (`AppInspector.tsx`, the same location as the pre-existing `RunAnalyticsPanel`, not behind `PanelDock` — matching how `RunAnalyticsPanel` itself is wired, so this is not a new registration pattern) with two file-upload inputs. It recomputes the comparison from whatever `runAnalytics` has measured so far on every render, not a snapshot frozen at the moment of import — genuinely "real-time" in the sense the plan's own text asks for, within the limits of a plain diff.

### A real second consumer, not a speculative addition

`runAnalytics.ts` gained `minuteFlows()`, returning the per-minute flow tally as structured data instead of only as a CSV string. This was not built speculatively: it has a second real caller (`RealObservationsPanel.tsx`'s comparison, which needs structured data to match against, not text to re-parse), and the pre-existing `csv.flows()` export was refactored to build on top of it rather than keep a second, separately-computed reshape of the same underlying tally — confirmed behaviour-preserving by the existing `runAnalytics.test.ts` suite passing unchanged.

`trajectoryDataset.ts`'s own CSV parsing (quote-aware line splitting, alias-tolerant column resolution, row-numbered errors) was extracted into a shared `csvParsing.ts`, the same "extract, don't duplicate" call this session already made once for `boundedNelderMead.ts` — two real call sites (`trajectoryDataset.ts`, `realObservations.ts`), confirmed behaviour-preserving by the existing trajectory-dataset tests passing unchanged (one test's own string assertion was updated for a harmless casing difference in the now-shared error message, not a behaviour change).

### What this is not

Not data assimilation: nothing here feeds a correction back into the running simulation, and there is no filter, no state estimate, no uncertainty model — just a subtraction, computed once per render. Not wired to the OD-calibration trio this project deleted in an earlier cleanup (`odCalibration`/`odSensitivity`/`odFlowAnalysis`, 2026-08-30) — that deletion's own reasoning (no real observed-data entry point existed) is the reason this batch exists, but reviving those modules was explicitly out of scope for this pass and was not attempted.

### This session's own review, applied

Ponytail-review of this diff reported no issues: the `csvParsing.ts` extraction has two real call sites and its exported `splitCsvLine` is directly unit-tested rather than being unused flexibility; every export from `realObservations.ts` is exercised by its own tests or by the panel; `minuteFlows()` has a genuine second consumer; the dual id/name matching in `compareLineCounts` is fully covered by its own test cases; the POS-receipt comparison's whole-run-only scope is honestly disclosed rather than overclaimed. No changes were required before commit.

33 new tests (`csvParsing.test.ts`, 8; `realObservations.test.ts`, 14, covering both parsers' column aliases and row-numbered errors, id/name-fallback matching, one-sided-minute handling, and the mean-absolute-error aggregation math; `RealObservationsPanel.test.tsx`, 6, including an explicit check that the comparison recomputes against new `minuteFlows()` data across a rerender rather than staying frozen at import time). 866 vitest tests total, cargo test, typecheck, lint and prettier all clean.

## 2026-09-23 (third entry): vehicle/traffic simulation, stage 1 — the spec ADR-0001 asked for, a bug ponytail-review caught, and a regression test proven decisive against the actual bug it names

Gap-closure plan batch 5.1. ADR-0001 (2026-06-19) named vehicle/traffic simulation as in scope, as its own sub-project SP-3, and required "SP-3 gets its own spec before implementation" — a requirement that sat unmet for three months while `roadSchema`/`transitStopSchema` existed with zero live simulation consumers (confirmed by direct investigation: every reference is rendering, a static commercial-analytics score, or `bioAgentBehavior.ts`'s `chooseTransitStop`, a decision-backend prototype wired to nothing but its own test). `roadSchema.speedLimitMetersPerSecond` defaulting to 1.4 m/s — a walking speed — was itself evidence the field was never meant for vehicles. This entry is that overdue spec (`docs/adr/0016-vehicle-traffic-simulation-stage1.md`), written first, then implemented against it in the same pass — the user, asked how to proceed given batch 5's one-line-per-item, multi-week-estimate scope (unlike batches 1–4's detailed breakdowns), chose to complete everything in order rather than stop to scope every item first.

### What was built, and what stage 1 deliberately is not

`vehicleSimulation.ts` is a standalone module — the same shape this session's ORCA and Moussaïd comparison layers took (ADR-0013, ADR-0014) — implementing IDM (Treiber, Hennecke & Helbing 2000, the exact model ADR-0001 named: "car-following à la IDM/Krauss") car-following, crosswalk yielding, and bus dwell, all three built on the same mechanism: an occupied crosswalk or an unserved transit stop ahead is simply treated as a stationary IDM obstacle, so a vehicle decelerates toward either exactly as it would toward slower traffic, rather than three separate rule systems. Schema additions are purely additive: `roadSchema` gains `vehicleAccessible` (default false), `vehicleArrivalRatePerMinute` (default 0), `vehicleSpeedLimitMetersPerSecond` (default 8.33 m/s, disclosed as a plausible urban placeholder, not fitted); a new `crosswalkSchema` is explicitly not a pedestrian routing target (pedestrians are not steered to use it — roads were confirmed to have no presence in `crowdNavigation.ts`/`floorRouting.ts`'s route-cost grid), only a point a vehicle checks for an occupying pedestrian.

Stage 1 deliberately does not attempt a road network (a vehicle only ever traverses the one road it spawned on, start to end — no turns, no cross-road routing), intersections or signals, or real transit ridership (`transitStop.boardingCapacityPerMinute` exists in the schema but nothing anywhere generates a pedestrian who walks to and waits at a stop, so a bus's dwell only ever accounts for its scripted `alightingPerArrival`, never a real boarding queue). Nothing is wired into `simulationEngine.ts`, the worker, the viewport, or the editor — a scene author can set `vehicleAccessible: true` today and nothing will happen yet.

### A real bug, found by this session's own review, not the exercise itself

Ponytail-review of the diff found one High-severity issue: `VehicleAgent.progressMeters`'s own doc comment said "0 at spawn, `totalLengthMeters` at despawn," but nothing removed a vehicle once it reached that point — `stepOneVehicle` only clamped it there. A vehicle that reached its road's end stayed in the array forever, jamming every vehicle behind it into an ever-more-stopped queue approaching a phantom that would never move again. Fixed with a filter on `stepVehicles`'s return, dropping any vehicle whose `progressMeters` has reached its own road's `totalLengthMeters`.

The first regression test written for this ("doesn't jam the road behind a vehicle that has already reached the end," a 2-simulated-second check) was itself checked by a second review pass and found not to be decisive: reconstructing the IDM math by hand and replaying the exact scenario showed the pre-fix (buggy) code passed that test too, since the two vehicles never closed to within IDM's meaningful interaction range in that short a window — the assertion was true whether or not the fix existed. Rewritten as a tick-by-tick comparison instead: a vehicle one tick from the road's end, with a real trailing vehicle close enough to be genuinely braking because of it (a 5 m actual gap against IDM's own ~17 m desired gap at that speed) — then asserting the trailing vehicle accelerates again on the very next tick rather than continuing to brake toward where the leader used to be. Verified decisive the same way the review found the first version wasn't: the despawn filter was temporarily reverted to the pre-fix behavior and both new despawn tests were confirmed to fail against it, then the fix was restored and the full suite re-confirmed green — not just asserting the regression tests would have caught it, showing they do.

### What this is not

Not a resolution of "no live pedestrian transit demand" — that gap (nobody walks to and waits at a stop) is unaffected. Not calibrated — IDM's constants and the bus dwell formula are literature/engineering order-of-magnitude placeholders, the same standing this project's ORCA/Moussaïd/elevator/escalator parameters already carry, stated the same way. Not a network — two vehicle-accessible roads that physically cross in a scene are not aware of each other in this model; that, intersections, signals, and engine/worker/viewport/editor wiring are named in ADR-0016 as SP-3 stage 2, not started.

17 new tests (2 scene-schema field/entity assertions folded into the existing BioCity-extensions test; `vehicleSimulation.test.ts`, 15: arclength geometry for multi-segment roads, both travel directions, free-flow acceleration to the speed limit, car-following that never lets a follower pass through its leader, crosswalk yielding and release, bus deceleration into a stop/timed dwell/resumption, the two despawn regression tests, and spawn-rate gating including no double-spawn onto an occupied entry). 881 vitest tests total, cargo test, typecheck, lint and prettier all clean.

## 2026-09-23 (fourth entry): multi-stage checkpoint queueing, stage 1 — cascading failure for free from stage dependency, three real gaps a second review caught

Gap-closure plan batch 5.2, whose entire plan text was one line: "安检→验票→扶梯串联、优先通道、故障级联" (security check → ticket gate → escalator, chained in series; priority lanes; cascading failures). Investigated before building anything: `servicePointSchema` already had a real N-server, service-time-distribution FIFO queue behind it (`checkoutCounters.ts`), but wired to exactly one call site — post-browse checkout at a shop — and fused throughout to `SimulationAgent`'s mall-specific lifecycle (`checkout`/`enterStore` states, `browseUntilSeconds`, a queue-line direction computed from the shop centroid). A pedestrian's decision state holds one `servicePointId`, not an itinerary; nothing lets a journey pass through two service points in sequence. `environmentFactorSchema`'s outage-flavoured entries (`escalatorOutage`, `gateFailure`) fold into one global scalar with no per-object targeting at all — a service point cannot actually go offline today, the same "schema exists, nothing live reads it" shape this session already found and fixed once for roads (ADR-0016).

### What was built

`docs/adr/0017-multi-stage-checkpoint-queue-networks.md`, written first, then `packages/app/src/checkpointQueueNetwork.ts` — a **new**, standalone N-server-FIFO primitive with stage chaining (`nextStageId`) and scripted outage windows, deliberately not built on `checkoutCounters.ts` for the fusion reasons above; what genuinely is reused is `sampleServiceSeconds` (Erlang-2, `behaviorDistributions.ts`), already generic with no mall coupling. Schema, purely additive: `servicePointSchema` gains `nextServicePointId` (absent: chain ends here, unchanged from every scene written before) and `outageWindows` (default empty: never down).

**Cascading failure is not a separate mechanism.** A stage in an outage window simply stops admitting new parties — it still finishes whoever it was already serving — and a downstream stage that depends on it for arrivals starves on its own, then floods once the outage ends: the ordinary consequence of one stage depending on another's output, not a bespoke propagation rule. `checkpointQueueNetwork.test.ts` proves this directly: ten parties queued at a down "security" stage, none reach "ticket-gate" for the whole outage window, then do once it ends.

Not attempted this pass, disclosed in the ADR: priority lanes (every stage is one FIFO queue, no eligibility/fast-track concept — the plan's own "优先通道"), branching (a stage's `nextStageId` is one id, not a routing choice — a linear chain only), a live fault model (an outage is a fixed scripted window, nothing can trigger one at runtime), and any wiring into `simulationEngine.ts`, the decision backend, the worker, the viewport, or the editor.

### Three real gaps a second review pass caught, all fixed before commit

Ponytail-review of the diff found the reinvent-the-wheel question was genuinely settled (read `checkoutCounters.ts` directly to confirm the fusion claim rather than trusting the doc comment), the same-tick chain-and-immediately-admit-downstream behaviour was traced by hand and found correct, and the exited-parties-are-dropped fix was verified complete — but reported three real gaps:

1. `outageWindows` had no `endsAtSeconds > startsAtSeconds` check, unlike `openingHoursSchema` fifty lines above in the same file, which already has a `.refine()` for the identical class of bug. Fixed with the same pattern.
2. `nextServicePointId` was never checked against the scene's own service-point ids, unlike a connector's `from`/`to` floor references, which the scene's own `superRefine` does validate. Fixed with the same pattern, in the same place.
3. `stepCheckpointNetwork` had no guard for a `nextStageId` — or a party's own `stageId` — pointing at a stage missing from the `stages` array passed in: the party would silently vanish from the result, indistinguishable from a normal exit. This is the same silent-loss failure class this session already paid for once in `vehicleSimulation.ts` (ADR-0016), in a different module written by the same session, days apart — the module's own doc comment now says so explicitly. Fixed by validating every party's stage and every stage's `nextStageId` up front, throwing rather than dropping. The first attempt at a regression test for this only checked the case reachable through the finishing-service branch and missed that a freshly _queued_ party at an unknown stage takes a different code path into the same silent loss — caught by actually running the new test against the fix (it failed), not just writing it and assuming it worked; the guard was broadened to check every party's current stage up front, not only ones finishing service that tick, and both paths are now covered by dedicated tests.

Editor round-trip: `EditorServicePoint`/`sceneEditorConversions.ts`/`sceneEditorAdders.ts` thread both new fields through both directions, and `addServicePoint`'s literal, even with no editor control for them yet — the explicit lesson this project's own `multifloorScene.ts` entry already named, applied proactively here rather than found by a later bug.

19 new tests (`checkpointQueueNetwork.test.ts`, 15, covering server-count admission, FIFO tie-breaking, chaining, outage admission/finish-in-progress/starve-then-flood, determinism, and the two fail-loud guards; scene-schema, 3, for chain/outage parsing and the two new validation rejections; `sceneEditorState.test.ts`, 1, for the round-trip). 897 vitest tests total, cargo test, typecheck, lint and prettier all clean.

## 2026-09-23 (fifth entry): IFC/BIM import — this project's first third-party heavy dependency, and four integration bugs no test suite alone would have found

Gap-closure plan batch 5.3. The plan's own text: "顾问项目的图纸多是 Revit/IFC；现在只有 DXF/GeoJSON/图片" (consulting projects' drawings are mostly Revit/IFC; only DXF/GeoJSON/image import exist). `dxfImport.ts` and `geojsonImport.ts` are both from-scratch, zero-dependency parsers, but that only works because DXF and GeoJSON are flat entity lists with inline coordinates. IFC (ISO 16739, STEP text encoding) sits behind an entity-reference graph and nested placement transforms — a from-scratch reader would be roughly an order of magnitude more code than `dxfImport.ts`, and would very likely still fail on real Revit exports, which commonly represent wall geometry as triangulated B-reps rather than simple extrusions, exactly the authoring tool the plan's own text names. Asked directly — this repo's `CLAUDE.md` requires justifying a new heavy dependency before adding one — the user chose `web-ifc` (a real WASM build of IfcOpenShell's geometry engine) over both a from-scratch subset parser and deferring the batch. This is this project's first third-party heavy WASM dependency; `core-behavior`'s own Rust→WASM is first-party code the team controls, a different category.

### What was built

`ifcImport.ts` reads `IfcWall`/`IfcWallStandardCase` geometry, projects each wall's resolved 3D mesh to the floor plane, and reduces it to a 2D convex hull as the wall's polygon outline — `web-ifc` does the real BIM geometry evaluation (resolving the placement chain, evaluating whatever solid representation a wall actually uses), so this project's own code only ever does 2D work on the result, which is exactly why this closes the Revit gap a from-scratch parser could not. Same disclosure `dxfImport.ts` already carries: only wall geometry is read — doors, windows, spaces, slabs, stairs, and every other IFC entity type are reported via a plain `hadUnconvertedEntities` boolean, not imported; a wall's convex-hull footprint is exact for the rectangular/box-ish walls that make up most real floor plans, an over-approximation for anything concave. `dxfImport.ts`'s own private `dedupeWalls`/`worldContaining` helpers were extracted into a new shared `importGeometry.ts` once `ifcImport.ts` gave them a second real caller, alongside a new `convexHull2D`.

### Four integration problems, each found only by actually running the feature, not by reading web-ifc's documentation

1. `mesh.geometries`'s own `.d.ts` declares `extends Iterable<T>`, but the runtime emscripten-embind `Vector` does not implement `Symbol.iterator` — `for...of` throws at runtime. Found by vitest itself throwing on the first real test run against the real installed package; fixed with indexed `.get(i)`/`.size()` access.
2. web-ifc's multithreaded build spawns a classic (non-module) Worker running code that uses `import.meta`, which only works inside a real ES module. Every import attempt in a real browser threw `Cannot use 'import.meta' outside a module` until `Init()` was called with `forceSingleThread: true` — a one-off floor-plan import is not a hot path worth that fragility for the parallelism it would buy.
3. `IfcAPI.SetWasmPath`'s directory-prefix-plus-loader's-own-filename-guess approach broke two different ways, both only visible in a real **production** build (`vite dev` resolves web-ifc's Node-targeted export and never exercises this path at all): a literal `"web-ifc.wasm"` string match failed to strip a production build's hashed filename (`web-ifc-BDaIXFUT.wasm`), and a generic last-path-segment fix still failed because the loader's own string concatenation dropped a path separator, requesting `/assets/web-ifc-BDaIXFUT.wasmweb-ifc.wasm`. Replaced with `Init()`'s `customLocateFileHandler` argument — a function that always returns the exact URL Vite already resolved via a `?url` asset import — sidestepping directory-prefix arithmetic entirely.
4. Vite's esbuild dependency pre-bundling breaks web-ifc's own worker script the same `import.meta` way, independent of `forceSingleThread`. Fixed with `optimizeDeps.exclude: ["web-ifc"]` in `vite.config.ts`.

Confirmed working end to end in both environments a real user would actually hit — `pnpm dev` and a real `vite build` + `vite preview` — each verified by dispatching a real `File`/`change` event at the real hidden `<input type="file">` the editor's own "导入 IFC" button clicks, in a real browser tab, then reading the resulting "已导入 IFC：1 面墙" status text and scene wall count back out of the live page. Not merely a passing vitest suite: vitest's Node environment resolves an entirely different, Node-targeted web-ifc entry point that never exercises any of the four problems above, which is exactly why all four were found in the browser, not in the test run that came first.

### This session's own review, applied

Ponytail-review of the diff reported no blocking issues after reading the full diff, the ADR, and `ifcImport.ts` in full, running the test suite, typecheck and lint, and independently re-verifying the coordinate math with an extra throwaway fixture. It flagged one real, if minor, gap: every fixture placement in the committed test suite used identity rotation, so the suite exercised translation but never the rotational part of `flatTransformation`, despite the module's own doc comment describing the coordinate math as verified. Rotation handling was already correct (the reviewer confirmed this independently), but the coverage gap was real — closed with a new test using a genuine 90°-rotated `IFCAXIS2PLACEMENT3D`, verified against the real `web-ifc` package via a throwaway Node script before being committed, the same discipline the rest of this module's fixtures already followed.

7 new tests in `ifcImport.test.ts` (a wall's real footprint from its resolved mesh, placement translation, placement rotation, unconverted-entity reporting via a real `IFCDOOR` fixture, world expansion for geometry outside the scene's bounds, the thickness option, merging with existing walls) plus 7 in `importGeometry.test.ts` for `convexHull2D`/`dedupeWalls`/`worldContaining`. 911 vitest tests total, cargo test, typecheck, lint and prettier all clean.

## 2026-09-23 (sixth entry): scenario A/B difference report — and a second correction to a CLAUDE.md claim found by actually checking it before building on top

Gap-closure plan batch 5.4. The plan's own text: "方案 A vs B 的差异报告——客户真正买单的东西" (a difference report between scenario A and scenario B — what clients actually pay for). Before writing anything, checked whether CLAUDE.md's own "V2 Progress" claim — "M6 experiment system now includes... side-by-side scenario comparison" — already covered this, since this project has a standing rule against building a shell for something that may already exist.

**The claim was narrower than its wording, the same class of gap this session already corrected once for `multifloorScene.ts`.** `scenarioComparison.ts`'s `compareExperimentVariants` and the live `ScenarioComparisonPanel.tsx` (genuinely registered in `panelRegistry.tsx` and clickable — not fabricated) only rank parameter _variants of one hardcoded fixture scene_ (`rimeaCoreScenarios[1]`, with three speed/exit-width overrides), never the user's own open scene, by exactly one derived metric (throughput delta %). `ExperimentSummary` has no evacuation time, level of service, journey times, or flow data at all. Nothing in this project diffs two independently designed scenarios or compares more than one number. `docs/adr/0019-scenario-diff-report.md` records this as the correction rather than silently building past it, so the earlier (narrower) claim's history stays visible rather than being quietly overwritten.

### What was built

`scenarioDiffReport.ts`'s `buildScenarioDiffReport` compares two `ScenarioRunSnapshot`s (a `RunAnalyticsSummary` plus optional evacuation clearance) across the metrics that mean the same thing regardless of how differently the two scenarios were designed: level of service (peak density, share at D-or-worse), journey time (P50/P90/mean), evacuation clearance (only when both sides ran one — never compared against a value that doesn't exist), and count-line flow matched by **name**, not id, since two independently authored scenes never share entity ids but a scene author's own label ("Main entrance") is comparable across scenes. `renderScenarioDiffReportHtml` produces a printable report, reusing `validationReport.ts`'s established `<table>` + `@media print` styling convention without forcing a single shared renderer over two data shapes (one scenario's benchmark results vs. a two-scenario metric diff) that differ enough that sharing more than the escaping helper would be the worse abstraction. `validationReport.ts`'s private `escapeHtml` was extracted into a shared `htmlEscape.ts` once this module gave it a second real caller — the same pattern used throughout this session (`boundedNelderMead.ts`, `csvParsing.ts`, `importGeometry.ts`).

Deliberately standalone, the same shape every other stage-1 module this session built took: it takes two already-computed run results and only diffs and renders — it does not run any simulation itself, and is not wired into a live "pick scenario A and B, run both, get a report" UI flow. That orchestration (a second engine instance, a way to pick or import the two runs to compare) needs its own design pass, the same way ADR-0016 named engine/worker wiring as separate, later work for vehicle simulation.

### This session's own review, applied

Ponytail-review independently re-verified the ADR's central factual claim by reading `scenarioComparison.ts`/`ScenarioComparisonPanel.tsx` directly rather than trusting the ADR's own description of them, and confirmed the gap was accurately characterized, not overstated. It traced the delta/percent math and the name-matching flow comparison by hand against the committed tests, confirmed HTML escaping was applied to every interpolated string (not just the one case the test suite happened to check), and confirmed the `htmlEscape.ts` extraction left `validationReport.ts`'s own `escapeAttribute` correctly building on the now-shared function. It flagged one small, genuinely dead piece of flexibility — `MetricDirection`'s `"neutral"` variant was declared and checked for in the renderer but never produced by any of the module's own metrics — removed before commit.

16 new tests: `scenarioDiffReport.test.ts` (9, covering delta/percent computation, the zero-baseline null case, evacuation clearance present/absent on either side, flow matching by name across all three outcomes — matched, only-in-A, only-in-B — and HTML rendering including a script-injection escaping check) and `htmlEscape.test.ts` (2). 922 vitest tests total, cargo test, typecheck, lint and prettier all clean.

## 2026-09-23 (seventh entry): a completeness audit, one real data-loss bug it found in this session's own earlier work, and two orphans a text grep initially missed

Asked directly for a completeness audit — what's actually wired into the live app versus standalone or orphaned, across everything built this session and the project as a whole. Delegated to a research agent with instructions to check reachability by real import chains, not by trusting any prior doc's claims; the agent's report was itself spot-checked before acting on any of it, the same discipline this project has applied to every audit finding all session.

### A real bug in this session's own earlier work, found before any user ever hit it

The three vehicle-simulation fields added to `roadSchema` for ADR-0016 (`vehicleAccessible`, `vehicleArrivalRatePerMinute`, `vehicleSpeedLimitMetersPerSecond`) were silently dropped every time a scene author used the editor's apply flow: `sceneEditorConversions.ts` rebuilt each road literal in both directions without them. This is the exact same failure class ADR-0017's own entry explicitly named and applied a fix for on `EditorServicePoint` — and missed on `EditorRoad`, added days earlier in the same session. Fixed by adding the three fields to `EditorRoad` (`sceneEditorTypes.ts`), threading them through both `createEditorDocumentFromScene` and `createSceneFromEditorDocument` (`sceneEditorConversions.ts`), and seeding them in `sceneEditorAdders.ts`'s `addRoad` with the same defaults `roadSchema` itself declares. The regression test was verified decisive the same way every bug fix this session has been: temporarily reverted, confirmed it failed, restored, confirmed it passed.

### A text grep gave a false positive; a real import grep didn't

The audit initially flagged `bioAgentBehavior.ts` as _not_ orphaned, because a plain text grep for its name matched a line inside `vehicleSimulation.ts` — which turned out to be that module's own doc comment mentioning `bioAgentBehavior.ts` by name, not an `import` statement. Re-checked with a grep restricted to real `from "..."` import syntax: zero non-test importers, for both `bioAgentBehavior.ts` (a complete, tested, but never-adopted `SimulationDecisionBackend` alternative for BioCity-style commuter/tourist personas — the project's runtime has only ever selected `mallCrowdDecisionBackend.ts`, matching its documented retail-first direction) and `crowdFlowAnalytics.ts` (a per-shop browsing/queuing snapshot, functionally superseded by `runAnalytics.ts`'s live, UI-wired `places` tracking, which derives the same agent-state signal plus timing percentiles). Both deleted, following the same process every earlier orphan deletion in this project used: re-grep immediately before deleting, not trust the audit's first pass. The doc-comment mention in `vehicleSimulation.ts` was updated to say the file was deleted rather than silently going stale.

### An honesty wording gap the earlier "AI" cleanup pass didn't reach

`AppHome.tsx`'s status-pulse row showed `{ label: "DATA", value: "D1/R2" }` — read plainly, a live Cloudflare D1/R2 connection. The backend's actual default (and only production-reachable) store is in-memory; `D1DatabaseLike`/`R2BucketLike` are structural TypeScript interfaces with no `wrangler.toml` or worker entrypoint anywhere in the repo that ever constructs a real D1/R2-backed store — `CollaborationStatusPanel.tsx` already states this correctly ("local demo storage plus Cloudflare D1/R2 contracts"), this one pulse just hadn't been brought in line during the 2026-08-30 "AI" honesty-freeze pass, which didn't touch storage wording at all. Changed the value to `"memory"`. `AppHome.tsx` had zero test coverage before this — added `AppHome.test.tsx` asserting both this and the pre-existing "TRACE: fixture" honesty label, so neither regresses silently again.

### A suite-level test that couldn't tell a pass-for-fail swap from nothing changing

`rimeaSuite.test.ts`'s summary assertion was `expect(summary.pass + summary.fail).toBe(15)` — true whether the split is 15/0 or 7/8, so a real test flipping status wouldn't necessarily move this number. Before touching it, confirmed by direct measurement (a temporary diagnostic test printing the actual per-test status breakdown under the file's own `cheap` parameterization, removed before commit — not assumed from CLAUDE.md's own prior write-ups, several of which have needed correcting this session already) that the real current split is 15 pass, 0 fail. Strengthened to assert those exact numbers. Checked this doesn't fight the suite's own documented philosophy: tests 4 and 11 do have individual `["pass","fail"]).toContain(status)` assertions in their own describe blocks, disclosing that their real, guideline-scale status can legitimately differ from what a cheap smoke-test parameterization shows — but that disclosure is about the _real_ parameterization, not this file's fixed, seeded `cheap` one, which has one deterministic outcome per test today and is worth a red test if that silently changes.

### This session's own review, applied

Ponytail-review of the diff reported no blocking issues, having independently re-run the import greps rather than trusting the summary, confirmed `addRoad`'s new defaults match `roadSchema`'s own zod defaults exactly, and confirmed the `rimeaSuite.test.ts` change doesn't conflict with the file's existing real-parameterization disclosures. It flagged one cosmetic gap — the `vehicleSimulation.ts` doc comment referenced this orphan deletion in "CLAUDE.md's 孤儿模块 section" before that section had actually been updated — folded into this same commit rather than left as a dangling forward reference.

Net test count: 915 vitest tests (down from 922 — the two deleted orphan modules removed roughly 20 tests of their own; 3 new tests added across `AppHome.test.tsx` and the road round-trip case). Cargo test, typecheck, lint and prettier all clean.

## 2026-09-23 (eighth entry): wiring the vehicle model the previous audit found standing idle, verified decisive by deleting the fix and watching five of six new tests turn red

The seventh entry's completeness audit named the road it left unfinished: ADR-0016 built a real, tested vehicle model and never called it from anywhere live. This entry closes that specific gap under ADR-0020 — engine, worker, viewport, editor — and deliberately nothing else (no road network, no crosswalk editor tool; both explicitly out of scope per ADR-0016 and left that way).

### The engine wiring, and why it copies the pedestrian floor-split exactly

`simulationEngine.ts`'s new `stepVehiclesTick()` steps `vehicleAccessible` road traffic once per floor, mirroring the exact split `advanceAgentsCpu` already uses for pedestrians: each floor's vehicles see only that floor's own roads and that floor's own pedestrians. This is not a stylistic choice — a single flat call across all floors would let a pedestrian on floor 2 occupy a crosswalk on floor 1's road at the same (x, y), the identical failure class ADR-0010 had to fix for pedestrian-pedestrian collision across floors sharing coordinates. `simulationSceneConfig.sceneRoadRuntimes` builds the per-scene `RoadRuntime[]` the same way `sceneHazardRuntimes`/`sceneConnectorRuntimes` already do, stamping each road's floor via the same `resolveFloorId` fallback every other scene-derived geometry uses.

**Verified decisive, not assumed**: the call to `stepVehiclesTick()` was temporarily removed and the new `simulationVehicles.test.ts` suite rerun — five of its six tests failed immediately (only the "gated by `vehicleAccessible`" test survived, since `sceneRoadRuntimes` still builds correctly with no stepping at all). Restored, all six pass. The six tests cover: gated off by default (existing scenes unaffected), spawns and drives when enabled, moves forward over time (not parked at spawn), two floors labelled correctly with no crash on identical road geometry, a hot scene edit cleanly drops a vehicle whose road disappeared (mirroring how a pedestrian standing on a deleted floor is handled), and `reset()` clears vehicles the same way it clears agents.

### Worker and viewport: no new protocol, one new small mesh

`SimulationSnapshot.vehicles` rides the existing `postMessage` snapshot channel every worker command response already carries — confirmed by direct inspection that this channel is a whole-object structured clone, not a field-by-field allowlist, so no worker-side code needed to change at all. The `SharedArrayBuffer` overlay built for thousands of pedestrians at 60 Hz was deliberately left untouched: a scene's vehicle count is bounded by its own arrival rates on however many vehicle-accessible roads it declares (tens, not thousands), so a second shared-memory lane was not worth building for this volume. The viewport gets one new small, fixed-capacity (64) `InstancedMesh` for vehicle boxes, disclosed as un-oriented — it does not turn to face its direction of travel, the same disclosed simplification the existing 2D pedestrian dot already carries, for the same reason: this is a position update, not a vehicle visual model.

### The editor: one toggle, two number fields, reusing what already existed

`EditorRoad`'s three vehicle fields were already round-tripped (fixed in commit `61ca5b2`, the previous entry) but had no control. Now they do: a toggle button reusing the exact same generic `toggleRoadBoolean(field)` mutation `walkable`/`transitOnly` already share, plus two number inputs (arrival rate, speed limit) shown only while a road is vehicle-accessible. Crosswalk placement remains schema-only — zero editor support of any kind, confirmed by direct search before starting (no adder, no param panel, no tool button) — named as the real, disclosed remaining gap rather than silently left out of the writeup: a scene author can now turn traffic on from the UI, but cannot yet place a crosswalk without hand-editing JSON, so a vehicle-accessible road drawn today drives correctly but never yields to anyone.

### Ponytail-review found two genuine simplifications, both applied before commit

`stepVehiclesTick` originally hand-built a `Map<string | undefined, RoadRuntime[]>` to bucket roads by floor. The review pointed out the function already has `floors` (one entry per plane, including the `{id: undefined}` single-floor default) sitting in scope, and the pedestrian loop two functions below buckets the exact same way already (`agents.filter((agent) => (agent.floorId ?? baseFloor()) === plane.id)`) — iterating `floors` directly and filtering roads the same way removes the Map entirely, with no behavioural change (checked: a road with a `floorId` that does not match any declared floor silently stops being driven under either version, an existing, accepted risk this rewrite does not introduce). Separately, `useSimulationViewportRenderer.ts`'s `seedAgents`/`seedVehicles` were the same six-line reset loop twice over, and `updateAgentInstances`/`updateVehicleInstances` each ended with the same twelve-line "clear stale instances past `visible`, commit the mesh's drawn count" block — both extracted into shared `seedMesh(mesh, capacity)` and `commitInstances(mesh, visible, rendered)` helpers, net eight fewer lines with no behavioural change (all directly-touched tests rerun clean after the refactor).

### What a live browser check could not confirm this session

The dev server was confirmed to run this code with zero new console errors (the only errors present were a pre-existing, unrelated `web-ifc` dev-mode worker issue already documented in ADR-0018's entry) and the existing no-vehicle demo scene continued running correctly with `stepVehiclesTick`'s no-op path active on every tick. Drawing a new `vehicleAccessible` road through the browser-automation tooling and watching a box move in the live viewport was attempted but not achieved this session — a click-registration issue specific to one toolbar control in this automation environment (confirmed via direct DOM inspection: the click landed on the correct element at the correct coordinates, `aria-pressed` simply never flipped), not a defect found in the app. The decisive evidence for the positive path is the automated test suite's revert-and-confirm-fail result above, not a screenshot; this limitation is named in ADR-0020 rather than papered over with an unearned "verified in browser" claim.

922 vitest tests, cargo test, typecheck, lint and prettier all clean. Disposition and full scope boundaries in `docs/adr/0020-vehicle-simulation-wiring.md`.

## 2026-09-23 (ninth entry): the crosswalk editor tool — closing this session's own named gap, and finding a browser-automation workaround for the previous entry's blind spot

The eighth entry's own "what this is not" section named the gap this entry closes: `crosswalkSchema` had zero editor support anywhere — no adder, no param panel, no tool button, schema-only since ADR-0016. Also fixed: the eighth entry could not get browser automation to click a toggle button at all; this entry found and used a working alternative for the same tooling, and used it to genuinely verify the positive path live rather than relying only on tests.

### A real spatial search, not the codebase's existing placeholder

Reconnaissance before writing any code found the closest existing analog — a transit stop's own (optional) `roadId` — is set with `document.roads.at(-1)?.id`, a "grab the last road drawn" placeholder with no correction UI if it guesses wrong (a hazard's `affectedRoadId` uses the identical placeholder). That placeholder does not work for a crosswalk: `crosswalkSchema.roadId` is _required_, so guessing wrong on an empty-roads scene would mean either a schema-parse crash or a dangling reference to a road that does not exist. Instead, `addCrosswalk` (`sceneEditorAdders.ts`) does a real nearest-road spatial search, using two new small helpers (`distanceToSegment`/`distanceToPolyline`, `sceneEditorGeometry.ts`) that project the click point onto every candidate road's own polyline and pick the closest. With no road on the active floor at all, placement is a no-op — the same choice `addConnector` already makes when there are fewer than two floors to join, rather than inventing a reference the simulation would read as pointing at a road that is not there. Because a spatial guess can still be wrong, `CrosswalkParamGrid` also gives it something the codebase's existing road-referencing entities do not have at all: an editable dropdown of every road id in the scene, so a bad guess is one click to fix instead of a JSON hand-edit.

**Verified decisive**: the nearest-road search was temporarily reverted to the codebase's existing "last road" placeholder, and the new "places a crosswalk on the nearest road, not just the last one drawn" test failed exactly as predicted — it asserted the crosswalk landed on the first (nearer) of two roads and got the second (merely most-recently-drawn) one instead. Restored, all tests pass.

### Two generic cross-entity functions, found by grep rather than assumed complete

`removeEntity` and `moveEntity` (`sceneEditorMoveRemove.ts`) each enumerate every entity kind by hand, one map/filter block per kind. `EditorDocument`'s TypeScript type only requires a `crosswalks` field to exist — it does not require either of these functions to have a case for it, so leaving one out would have compiled cleanly and produced a crosswalk a scene author could place but never delete or drag, with no error anywhere to point at why. Both were checked directly (not assumed complete from the type system) and both needed a case, now added, each covered by a dedicated regression test.

### Ponytail-review caught a third copy of the same distance math

The new `sceneEditorGeometry.distanceToSegment` (written for the nearest-road search above) turned out to duplicate an existing private helper of the identical signature already in `worldPlacement.ts` — the same clamped-projection-then-`Math.hypot` computation, unnoticed before review because it was never searched for outside the file being written. (A fourth version exists too, in `wallIndex.ts`, but operates on a differently-shaped `WallSegment` type and was correctly left alone — not a fifth copy of the same problem.) Fixed by deleting `worldPlacement.ts`'s private copy and importing the one in `sceneEditorGeometry.ts` instead. This direction mattered: `worldPlacement.ts` already imports from `sceneEditorState.ts`, which re-exports `sceneEditorGeometry.ts` via `export *` — so the reviewer's first-suggested direction (export `worldPlacement.ts`'s copy, import it into `sceneEditorGeometry.ts`) would have closed a real circular-import loop through that barrel file. Importing the other way does not, and was checked before applying, not after.

### Verified live, working around the previous entry's browser-automation blind spot

The eighth entry recorded that clicking the vehicle-accessible toggle button through the browser-automation tool's synthetic input never registered, despite landing on the correct DOM element at the correct coordinates — confirmed but unexplained, and left as a named limitation rather than a fabricated "verified in browser" claim. For this entry, the same environment's devtools JavaScript execution was used to dispatch input a different way — direct `element.click()` calls for buttons and real `PointerEvent` construction/dispatch for the SVG canvas — and this worked cleanly where the automation tool's own synthetic clicks had not. Using it: the `CW斑马线` tool button was confirmed present in the palette in the correct position (immediately after the transit-stop tool, matching where it was inserted in the tool-order array); selecting the tool and dispatching a pointerdown on the canvas increased the status panel's road count then crosswalk count exactly as expected (an intermediate read that appeared to show zero crosswalks turned out to be a premature read before React's state update had committed — rereading after a longer wait showed the correct count, a reminder that "the number didn't change yet" and "the action failed" are not the same claim without re-checking); the crosswalk appeared as a real, selectable DOM element; selecting it opened the param panel with a working road dropdown, pre-populated with the scene's actual road ids, and a width field. One manual click happened to match a different (and, on reflection, obviously nearer — a long named street versus a newly drawn 20 m test segment) road than the one placed directly under the cursor moments before; this is not a bug in the nearest-road search, which the automated test above already verifies against exact, controlled distances — it is just what an arbitrarily chosen manual click on a real, busier scene will do, and is recorded here rather than quietly omitted because it is a real observation, not a clean confirmation.

### What this does not do

Crosswalk placement does not retroactively change what a crosswalk _does_ in the simulation — `vehicleSimulation.ts`'s own crosswalk-yielding logic (unit-tested, unchanged) is exactly as it was under ADR-0016. This entry only makes a crosswalk reachable from the UI at all. It also does not attempt to orient the crosswalk's visual marker to its road's true direction of travel in either render surface — the same disclosed simplification the vehicle boxes themselves already carry, for the same reason (this is a position marker, not a geometry-aware stripe).

7 new tests (four in `sceneEditorState.test.ts` covering nearest-road placement, the no-road no-op, editing roadId/width through apply, and move/delete; one each in `SceneEditorParamPanel.test.tsx`, `SceneEditorCanvas.test.tsx` and `bioCityRenderPlan.test.ts`). 929 vitest tests, cargo test, typecheck, lint and prettier all clean. Full scope boundaries in `docs/adr/0020-vehicle-simulation-wiring.md`'s same-day addendum.

## 2026-09-23 (tenth entry): checkpoint chaining in the decision backend — the module named for this gap turned out to be the wrong thing to wire in, and its own doc comment already said so

The completeness audit's list of "real module, zero live consumer" gaps had one item left after the ninth entry closed the crosswalk one: `checkpointQueueNetwork.ts` (ADR-0017), described in CLAUDE.md's own history as standalone, not wired into the engine, decision backend, worker, viewport or editor.

### The first question was whether that module was even the right one to wire in

Before writing any code, reconnaissance asked directly: does `checkpointQueueNetwork.ts`'s own internal state need real pedestrian agents at all, or is it an alternate implementation that should stay standalone? The module's own doc comment already answers this, and had for as long as it existed: `CheckpointParty` is `{id: number, stageId, status, ...}` — no position, no floor, no link to `SimulationAgent` of any kind — and the comment explicitly declines reusing `checkoutCounters.ts`'s existing mechanics "since it would mean either overloading pedestrian lifecycle states with checkpoint semantics that don't fit, or refactoring a live, heavily-tested production module." Wiring the module in as written would have meant building a second bookkeeping layer translating its abstract queue ticks into real walk targets — reimplementing what `checkoutCounters.ts` already does. `checkpointQueueNetwork.ts` stays exactly as standalone as it was, the same status as the ORCA and Moussaïd comparison layers.

What the audit had actually found unreachable, once this was sorted out, was much smaller: two scene-schema fields, `nextServicePointId` and `outageWindows`, that `deriveSceneGeometry` never forwarded into the runtime `SimulationServicePoint` type the decision backend reads. Write-only, confirmed by direct inspection — the same shape as the vehicle fields ADR-0016/ADR-0020 forwarded a few entries ago.

### The fix reuses existing production mechanics rather than building new ones

`checkoutCounters.ts` is already keyed generically off `agent.servicePointId` — nothing about it assumes a buyer only ever visits one service point. `mallCrowdDecisionBackend.ts`'s `enterStore`-completion branch, previously an unconditional `leaveDecision`, now checks the just-served service point's `nextServicePointId` and, if it names a real service point, redirects the buyer to walk there and queue again — the exact same `checkout`/`enterStore` cycle running a second time under a different id, with zero changes to `checkoutCounters.ts`'s own admission or service logic. A new `checkpointHopCount` safety counter (capped at 8) exists purely to bound a scene-authoring mistake — a cycle (`A` chains to `B` chains back to `A`) that the scene schema's own existence check does not catch, since a cycle is still schema-valid.

Outage windows needed two new admission checks in `checkoutCounters.ts`, not one: the batched admission loop, and — easy to miss — the direct-service fast path for a buyer arriving at an empty line with a free server, which would otherwise serve them instantly regardless of an outage.

### Ponytail-review caught the first draft duplicating the outage check, and confirmed only half the duplication should be undone

The first version wrote its own private `isInOutage` inside `checkoutCounters.ts` — functionally identical to a private `isDown` `checkpointQueueNetwork.ts` already had, three lines of range-check logic copied a second time without checking for a shared home first. Review pointed out both files already depend on `behaviorDistributions.ts` (`sampleServiceSeconds`), a genuinely neutral third location, and that this session had already set the precedent for exactly this situation one commit earlier (`distanceToSegment`). Fixed by moving the check to `behaviorDistributions.ts` as `isWithinOutageWindow` and pointing `checkoutCounters.ts` at it.

`checkpointQueueNetwork.ts`'s own private `isDown` was deliberately left exactly as it was, still its own separate copy of the same three lines — not switched to call the new shared function. This is a real, considered difference from the `distanceToSegment` case, not an inconsistency: `worldPlacement.ts`'s old private copy had no stated reason to exist separately, while `checkpointQueueNetwork.ts` has said across four ADRs now (0013, 0014, 0017, this one) that it intends to stay entirely self-contained, importing as little as possible. Changing it to depend on `behaviorDistributions.ts` — even for three lines it would have gotten for free — would have been a small crack in a boundary the project has chosen to keep sealed on purpose. Half the duplication is gone; the other half stays, deliberately.

### Verified decisive at three layers, not just the one that was easiest to test

`checkoutCounters.test.ts` got two new tests proving outage gating holds at both admission paths — reverting either check made the corresponding test fail. `mallCrowdDecisionBackend.test.ts` got three: a straightforward redirect case, a dangling-`nextServicePointId` fallback case, and — reworked after an initial draft was checked for decisiveness and found wanting — a hop-cap test that checks both sides of the boundary (seven hops still chains, eight leaves) rather than asserting only the capped case, which would have passed identically whether the cap was correctly enforced or chaining had never been implemented at all. A new `simulationCheckpointChain.test.ts` drives the actual production entry point, `createSimulationEngineFromScene` — the same function both the worker and the main-thread controller call — with a real scene built via `parseScene`, and confirms a spawned, walking agent physically reaches a `boarding-gate` service point after being served at `security`, and eventually exits rather than getting stuck. Reverting the redirect logic (`false && next && hops < maxCheckpointHops`) made this test fail exactly as expected; restoring it passed.

### What this does not close

There is still no editor control for `nextServicePointId`/`outageWindows` — round-tripped since ADR-0017, but a scene author can only author a chain by hand-editing JSON. This is the identical shape of gap ADR-0020 left open for crosswalks and then closed in the very next entry; the same follow-up for checkpoints was not attempted this session. Because there is no UI to drive, there was nothing to click-verify in a live browser either — the decisive evidence for the positive path is `simulationCheckpointChain.test.ts` running the real production engine-creation path against a real scene, not a screenshot of a browser session, which is the honest description rather than an unearned "verified in browser" claim.

7 new tests, 936 vitest tests, cargo test, typecheck, lint and prettier all clean. Full scope boundaries in `docs/adr/0021-checkpoint-chaining-in-decision-backend.md`.

## 2026-09-23 (eleventh entry): the checkpoint editor control — and finally getting a real click to register in the browser-automation tool

The tenth entry's own "what this does not close" section named the gap this entry closes: no editor control for `nextServicePointId`/`outageWindows`, round-tripped since ADR-0017 but only settable by hand-editing JSON.

### The dropdown and the text field, not a new interaction pattern each

`ServiceParamGrid` (`SceneEditorRetailParamGrids.tsx`) gained a `nextServicePointId` dropdown listing every other service point in the scene — never the selected one itself, so the dropdown alone cannot author a trivial one-hop self-loop, though a longer cycle through other stops remains possible and is bounded by `checkpointHopCount`'s cap, not by this list — plus a "no next stop" option that clears the field. `outageWindows` got a text field parsed as `"start-end, start-end"` (seconds), deliberately not a dedicated add/remove-row list UI: `updateDocumentEntranceProfile` had already established the committed-on-blur, comma-separated-text convention for exactly this shape of problem (`arrivalProfile`), and reusing it rather than inventing a second pattern was the more consistent choice for what is usually zero or one window.

### A real, if small, component consolidation fell out of building this

The text-field mechanics `outageWindows` needed — draft state while focused, commit on blur — turned out to be identical to what a single-purpose `ProfileInput`, local to `SceneEditorFacilityParamGrids.tsx`, already did for `arrivalProfile`; only the display format differed. Rather than write a second copy, `ProfileInput` was generalised into `TextInput` (`SceneEditorParamInputs.tsx`, alongside the existing `NumberInput`/`SelectInput`), with the specific "join rates into a display string" step moved to the entrance call site, where it always belonged. Net effect: one new generic input primitive, one fewer specialised one, both call sites slightly shorter.

### Verified decisive

The outage-window parser's inverted-pair guard (`endsAtSeconds > startsAtSeconds`) was temporarily removed, and the new "parses outage-window text into windows, dropping malformed or inverted pairs" test failed exactly as predicted — a deliberately inverted `500-500` pair that should have been dropped showed up in the result instead. Restored, all tests pass.

### Verified live, and the earlier browser-automation blind spot finally has an explanation, not just a workaround

The eighth and tenth entries both recorded that the browser-automation tool's synthetic clicks would not register on certain controls, and worked around it with `element.click()`/`PointerEvent` dispatch. This entry adds the missing piece: React tracks a controlled `<select>`/`<input>`'s value through its own internal property-descriptor hook, and a plain `element.value = "..."` assignment bypasses that hook entirely — React never sees the change, so no re-render follows and no `onChange` fires. The fix is to call the native setter directly (`Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set`) before dispatching the `change`/`input` event, which is what a real user's keystroke or click does under the hood but a naive scripted assignment does not. With that, verification was genuinely complete: the dropdown's options were confirmed to be exactly the scene's other service points, excluding the one selected; selecting a value and reading the panel back afterward showed the selection persisted; typing `"600-900, 1800-2000"` into the outage field, blurring, and reading the input's `.value` back afterward showed the exact string round-tripped through the mutation and back into the rendered control — proof the state update and re-render both happened, not just that a keystroke was accepted somewhere.

3 new tests (two in `sceneEditorState.test.ts`, one in `SceneEditorParamPanel.test.tsx`). 939 vitest tests, cargo test, typecheck, lint and prettier all clean. Full scope boundaries in `docs/adr/0021-checkpoint-chaining-in-decision-backend.md`'s same-day addendum.

## 2026-09-23 (twelfth entry): wiring the scenario diff report — closing the one gap ADR-0019 named as its own remaining scope

`scenarioDiffReport.ts` (the sixth entry above, ADR-0019) was a real, tested comparison-and-report module with its own doc comment stating plainly what it did not do: "Actually running scenario A and scenario B side by side in the live app... is not attempted here and would need its own design pass." A survey of what remained actionable in the project pointed at exactly this gap, the same "real module, zero live consumer" shape this session closed repeatedly (vehicles, checkpoint queues, IFC import).

Two things were confirmed before writing code. First, `ScenarioComparisonPanel.tsx` (the "M6" panel) was re-confirmed as not an extension point — ADR-0019 had already established this, and this pass didn't re-litigate it, just re-checked the conclusion still held. Second, no existing headless runner produced the `RunAnalyticsSummary` shape `scenarioDiffReport.ts` actually consumes: `runBenchmarkScenario` (`benchmarkRunner.ts`) computes a narrower `BenchmarkRunResult`; the LOS/journey/flow shape had only ever come from `useRunSeries.ts` sampling a live, interactive engine.

### What was built

`scenarioDiffRunner.ts` combines `runBenchmarkScenario`'s step-loop with `createRunAnalytics()`, sampling once per simulated second — matching `useRunSeries.ts`'s own `Math.floor(elapsedSeconds)` dedup, not once per physics step. A decisive test proved this mattered: with the dedup temporarily removed, sample count for a 90 s / (1/20 s) scenario jumped from ~90 to 1801. An `evacuate` option calls `engine.setEvacuation(true)` before stepping and carries `evacuationClearSeconds` onto the result, applied identically to both sides of a comparison since there is still no scene-schema flag for "this scenario is an evacuation."

`scenarioDiffWorkerClient.ts`/`scenarioDiff.worker.ts` follow `rimeaWorkerClient.ts`/`rimea.worker.ts`'s exact shape (a bounded headless computation, no progress or cancellation) rather than the heavier progress/abort `experimentWorkerClient.ts` pattern — only two scenario ids and an evacuate flag cross `postMessage`; both sides look the scenario up from `rimeaCoreScenarios` via a shared `findScenario`. The two scenario pickers in the new `ScenarioDiffPanel.tsx` draw from that same fixture pool (straight corridor, bottleneck, corner, counterflow) — the same set `ExperimentSweepPanel`/`RimeaReportPanel` already run headlessly — not the user's own open scene, since exactly one of those is open at a time and there is nothing to diff it against. On completion, `buildScenarioDiffReport` runs synchronously (pure, cheap) and the report opens via `ValidationReportPanel.tsx`'s established Blob + `URL.createObjectURL` + `window.open` + delayed-revoke pattern, reused inline rather than factored out — ponytail-review weighed extracting a shared helper and found the two call sites build their blobs from different inputs for a few-line saving, not worth a new module. Registered in `panelRegistry.tsx` as `scenario-diff-report`, `dataSource: "fixture"`.

### Verified live

Real dev server, real click-through, not just unit tests: the panel's two selects showed the real four `rimeaCoreScenarios` names; clicking "运行对比" ran a genuine Web Worker round trip — two real 90 s simulations via `createSimulationEngineFromScene` — and produced "RiMEA straight corridor vs RiMEA bottleneck | 5 项指标 | 0 条计数线" (zero flow lines because neither built-in scenario names a count line, a disclosed limitation of the fixture pool, not a bug). Checking "两侧均触发疏散" and re-running moved the metric count from 5 to 6 — live proof the evacuation-clearance metric is conditionally added exactly as `buildScenarioDiffReport` specifies. No console errors on either run.

12 new tests (4 in `scenarioDiffRunner.test.ts`, including the sampling-cadence decisive test; 4 in `scenarioDiffWorkerClient.test.ts` following `experimentWorkerClient.test.ts`'s fake-worker pattern; 4 in `ScenarioDiffPanel.test.tsx` following `RimeaReportPanel.test.tsx`'s fake-worker panel pattern), plus the existing render-smoke test extended with the new panel id. 952 vitest tests, cargo test, typecheck, lint and prettier all clean. ponytail-review found nothing to cut. Full design in `docs/adr/0022-scenario-diff-report-wiring.md`.

## 2026-09-23 (thirteenth entry): the arrival-profile slot length becomes editable

A small, disclosed loose end named in CLAUDE.md's handoff summary: "分时段到达的时段长度 UI 改不了（固定 15 分钟）" (the demand-profile slot length can't be changed in the UI — stuck at 15 minutes). `entrance.arrivalProfile.intervalMinutes` (ADR-0009) is a real, live-consumed field — `simulationSceneConfig.ts` reads it to compute `intervalSeconds`, which genuinely drives when the engine advances to the next slot's arrival rate — but the editor only ever wrote the schema's own default (15) the first time a profile was created from the rate-list text field, with no control anywhere to change it afterward. The `arrivalProfile` label's own copy still hardcoded "15 min each," which stopped being accurate the moment this was fixed.

Closed with one `NumberInput` on `EntranceParamGrid`, threaded through the same five-file chain (`SceneEditorFacilityParamGrids.tsx` → `SceneEditorParamPanel.tsx` → `SceneEditorLayout.tsx` → `SceneEditor.tsx` → `SceneEditorParamActions.ts`) every other param-grid control in this editor already follows — the same shape as the recent service-point "next stage" dropdown and checkpoint outage-window text field (ADR-0021's addendum). The new field only renders when `selectedEntrance.arrivalProfile` is already set: the interval means nothing until there are slots for it to size, the same reason the rate-profile text field itself is only offered once a kind other than "sink" is selected. The new mutation, `updateDocumentEntranceProfileInterval`, is a no-op on an entrance with no profile yet — it does not fabricate an empty-rates profile just to hold an interval value — and clamps to a minimum of 1 minute, matching the "clamp rather than reject" convention `updateDocumentEntranceNumber` already uses a few lines above it in the same file for width and group share.

### Verified decisive

Two guards were each temporarily removed and the tests written against them confirmed to fail before being restored: the mutation's no-profile guard and minimum clamp (removed together — the test then read back an object it expected to be `undefined`, and a negative interval that should have clamped to 1 instead), and the panel's conditional render (temporarily forced to always render — the "hidden without a profile" test then found the input it expected to be absent).

### Verified live

Real dev server: selecting an entrance with no profile showed no slot-length field; typing a rate profile and blurring made the field appear, defaulting to 15; changing it to 5, selecting a different entity, and selecting the original entrance again showed the field still reading 5 — proof the value round-tripped through the document's actual state rather than only a local input's DOM value. No console errors.

ponytail-review found nothing to cut ("clean, minimal, precedent-following... no speculative abstraction, no new dependency, no dead code path"). No new ADR: this is not a new architectural or model decision, only an editor control for a field ADR-0009 already settled. 3 new tests, 955 vitest tests, cargo test, typecheck, lint and prettier all clean.

## 2026-09-23 (fourteenth entry): a waiting companion no longer freezes in the middle of a corridor

Another small, disclosed loose end from CLAUDE.md's handoff summary: "同伴原地等待会站在通道里" (a waiting companion freezes in place, which can be mid-corridor). `walkingGroups.ts`'s `followLeaders`: while a group's leader is queuing or checking out, a companion previously froze at exactly whatever coordinates it occupied the moment the leader stopped — which, since companions walk in step with their leader until then, could be square in the middle of a walkway, for as long as the leader stayed in line. The module's own doc comment already promised "wait nearby," not "wait exactly here."

### What changed

A companion now steps `walkingGroupParameters.waitStepAsideMeters` (0.8 m, self-chosen — Moussaïd et al. 2010 says nothing about where a waiting companion stands) to one side of the straight line between itself and its leader, computed once — the first tick it is not yet "settled" at its previous target — and held steady afterward via the `settled` check the code already used before this change (so it does not jitter every decision tick). No wall or obstacle knowledge is used: `crowdMovement`'s own wall constraint clips the actual walk the same way it does for every other agent, so worst case a companion stops short of the offset point rather than passing through something solid.

### Verified decisive

Two behaviors were each temporarily reverted and the tests written against them confirmed to fail first: freezing in place again made the "steps aside" test find the companion's target unchanged from its own position; always recomputing the offset (instead of holding it once settled) made the "holds the step-aside point" test find a target that had drifted from where it was pinned.

### Ponytail-review caught a real duplication

The new `stepAsideFromLeader`'s perpendicular-rotation math — `(-dy, dx)` normalized — was hand-rolled a second time in the same file: `groupFormation`, a few dozen lines down, already computes the identical rotation to lay group members out side-by-side across their direction of travel. Extracted into a shared `perpendicularUnit(dx, dy)` and both call sites switched to it; `groupFormation`'s output is bit-for-bit unchanged (confirmed by the existing "keeps people arriving together together, walking abreast at one pace" test, which drives a real engine and checks the actual spacing between paired companions, not just that the function returns).

### Not verified live

This is a sub-meter positioning adjustment — whether a companion's wait point sits 0.8 m to one side is not something a rendered viewport can confirm by eye at any zoom level worth using. Unit tests driving `followLeaders` directly, plus the pre-existing full-engine formation test, are the actual proof here, the same way this session has verified other fine-grained physics/behavior tuning (letting distance, formation spacing) without a browser click-through.

No new ADR: a local improvement to an already-decided behavior model, not a new architectural or model decision. 2 new tests, 957 vitest tests, cargo test, typecheck, lint and prettier all clean.

## 2026-09-24: open-source readiness, batch B0 — the blockers, not the deletions

A full-project audit (five parallel read-only surveys: UI inventory, open-source readiness, performance, tech debt, feature completeness against every spec/plan/ADR) found the engine itself real — 30 capabilities genuinely live on the running path — but three things stopping the repo from being published at all: no `LICENSE`, no `README`, and a third-party pedestrian dataset committed with license terms the project's own data README already admitted were "not independently checked." The owner chose Apache-2.0 and approved every other recommendation in the survey. This entry covers only the blockers; the larger recommended deletions (dead AI/tiles/GLB surfaces, the optional backend/collab package, the `bioCity` rename, the driving-cockpit UI overhaul) are tracked in `docs/superpowers/plans/2026-09-24-open-source-and-ux-overhaul-plan.md` as later batches, not done here.

### What actually changed

- **`LICENSE`** (Apache-2.0, the canonical text through "END OF TERMS AND CONDITIONS" plus a filled-in copyright notice) **and `license: "Apache-2.0"`** added to all 6 `package.json` files and `packages/core-behavior/Cargo.toml` (the latter also silences a `wasm-pack` warning about the missing field). **`NOTICE`** records the one dependency under a different license: `web-ifc` (MPL-2.0), used unmodified as an npm package, no source copied in.
- **`README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`** added at the root. The README's "Status, honestly" section is not marketing copy — every claim in it was checked against the audit before being written (RiMEA 13/16 pass rather than a rounder-sounding number, "100k WebGPU" scoped to the step-kernel benchmark with zero app importers, "AI" surfaces named as template logic, 12/16 panels named as fixture-labeled, the backend named as present-but-undeployable). CODE_OF_CONDUCT is the standard Contributor Covenant 2.1; SECURITY.md states the backend's fail-closed login and its lack of any deploy config, so a self-hoster knows what they're responsible for.
- **The ETH pedestrian dataset (`docs/calibration/data/eth-biwi-eth.txt`, 114 KB) is no longer redistributed.** `git rm --cached`, added to `.gitignore`, and the file's own README replaced with a `curl` command plus the sha256 checksum (`cf8d3fd3...ab082b`) of the exact copy this project's 2026-09-22 trajectory-calibration run used, so anyone re-running that analysis can verify they fetched the identical bytes. The consuming test (`trajectoryCalibration.calibration.test.ts`) is already gated behind `CALIBRATE=1` and skipped by default — removing the file has zero effect on `pnpm test`, verified by running it (skipped, as before) — but its `readFileSync` call is now wrapped to turn a bare `ENOENT` into a message pointing at the README's fetch instructions, decisively checked by hiding the file locally with `CALIBRATE=1` set and confirming the new message actually fires, then restoring the file and confirming the test passes again.
- **`packages/app/src/wasm/core-behavior/` (the `wasm-pack` output, ~114 KB) is now checked into the repo, not gitignored**, and `build:wasm` is removed from the `dev`, `dev:e2e`, `build`, `test`, and `typecheck` script chains (kept as its own script, plus `test:rust` also pulled out of `test`). **This reverses what the audit itself first recommended** ("`build:wasm` 摘出关键路径…`behaviorWasm` 的动态 import 已经能容忍没构建") — that claim was checked, not assumed: temporarily hiding the generated directory and running `tsc --noEmit` produced two `TS2307: Cannot find module` errors (`behaviorWasm.ts` and its test both statically import the generated `.js`/`.d.ts`), so simply dropping the build step would have broken `pnpm typecheck` for every contributor who has never run `wasm-pack`. Checking in the output — standard practice for a small, rarely-changing generated artifact behind a toolchain most contributors won't have — resolves it without inventing a stub/shim. `wasm-pack` itself writes a self-excluding `.gitignore` (`*`) into its own output directory on every run; `build:wasm` now deletes that file afterward (`node -e "require('fs').rmSync(...)"`, no new dependency) so the checked-in copy doesn't silently stop being trackable on the next regeneration. `.github/workflows/ci.yml` gained explicit `pnpm build:wasm` and `pnpm test:rust` steps (previously implied redundantly inside both the old `typecheck` and `test` scripts) so CI still verifies against a freshly-built Rust source, not just the checked-in copy.
- **All `"latest"` dependency specifiers (24 across 6 manifests) pinned to `^<currently-resolved-version>`**, resolved from what was already installed (`node -p "require('./node_modules/<pkg>/package.json').version"` per package, not guessed), then `pnpm install --lockfile-only` to update the lockfile's specifier strings without touching any resolved version — confirmed with `pnpm install --frozen-lockfile` succeeding immediately after (no re-resolution needed, so no dependency actually changed version).
- **Three of CLAUDE.md's own numbers were stale and are corrected, struck through rather than silently replaced** (the file-size standard bullet dated 2026-07-28): `SimulationViewport.tsx` was recorded at 1703 lines but has since been split into `SimulationViewport.tsx` (137), `SimulationViewportOverlays.tsx` (283), and `useSimulationViewportRenderer.ts` (665) — the largest file is actually `rimeaSuite.ts` at 3142; the file/CSS counts (14→16 total, 11→12 excluding tests; the four named CSS files no longer exist, replaced by `packages/app/src/styles/*.css`) are recounted with the exact same `find`/`wc -l` command the original entry specified, not a new methodology. A second correction: a claim from this same day's audit that "`core-gpu` package is unused by the app" was itself wrong and is recorded precisely — the narrow, true claim (`gpuSimCore`/`createGpuSimCore`, the 100k-agent kernel, has zero app importers) still holds and was reverified; the `core-gpu` **package** has 18 non-test importers, nearly all type-only or in modules that already disclose themselves as unwired (`movementBackend.ts`'s own header comment, four `*Probe.ts` files, the fixture-labeled `ScaleReadinessPanel.tsx`) — only `heatmap.ts` and `evacuationPlan.ts` use it for real, live-path work, and neither touches the GPU compute path `gpuSimCore` owns.
- Untracked log/scratch files (`.vite-5184.log`, `dev-server.log`, `output/`, `test-results/`) were already correctly `.gitignore`d, not committed — the audit's claim that they were "tracked junk" was checked with `git ls-files` and found false; no action was needed there.

### Verified

`npx prettier . --check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (957 vitest tests, 2 skipped as before), `pnpm test:rust` (11 Rust tests), and `pnpm build` (confirms the checked-in WASM artifact is genuinely load-bearing for `vite build` — the compiled `.wasm` shows up correctly in `dist/assets/`) all run clean with `build:wasm` removed from their chains. ponytail-review: nothing to cut. Real, previously unrecorded bundle-size data surfaced as a side effect of running `pnpm build`: `web-ifc-api` chunk 3.5 MB (592 KB gzip), `SimulationViewport` chunk 688 KB, main `index` chunk 1.3 MB — worth folding into the performance-focused batch of `docs/superpowers/plans/2026-09-24-open-source-and-ux-overhaul-plan.md` later, not acted on here.
