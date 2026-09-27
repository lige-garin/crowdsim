# ADR 0033: Wiring the GPU step kernel into the live simulation engine

- Status: **Stages 1-3 complete and hardware-verified; stage 4 measured for
  movement + decision + readback, rendering still unmeasured** (2026-09-25/26).
  See the stage 4 entry below for the measured numbers and why rendering
  is the one piece still open. Stage 1: fixed
  `GpuSimCore`'s broken bind group (11 of 15 bindings wired, stale 68-byte
  `moveParamsBuffer`) and added the missing `uploadGroupIds`/
  `uploadFormationSlots`/`uploadHazardAvoidance`/`uploadHolding`/persistent
  `readback()` surface — see `docs/CLAIMS_LEDGER.md` for the full record,
  including a second real bug (`velBuffers` missing `COPY_SRC`, caught by
  the first real-hardware run of the new API). **A real gap surfaced while
  scoping stage 2, closed the same session**: `crowdMovement.ts` does not
  walk straight at its literal target for a non-holding agent — it calls
  `router.direction()`, which returns the straight-line direction only
  with line of sight, otherwise the steepest-descent direction along a
  precomputed Dijkstra field (routing around walls/corners), decoupled
  from the literal target used for distance/speed-easing/the overshoot
  clamp. The kernel had no way to receive that pre-routed direction — it
  derived `desired` from `targets` internally. Added a 16th binding,
  `routedHeading` (a host-computed unit vector per agent, mirroring the
  group/formation/hazard/holding pattern but with NO in-kernel
  fallback — the CPU-oracle TS functions and `stepForParity` default to
  straight-line when omitted, for backward compatibility with every
  pre-existing test, but the WGSL kernel and `GpuSimCore`'s public API do
  not, since a live engine integration always has a real routed value to
  supply). Hardware-verified: exact parity with the CPU oracle given the
  identical routed heading (maxDiff 0 / 4.77e-7 across two fixtures), plus
  a decisive check that agents genuinely walk the routed direction, not
  the target direction. This is additive to ADR-0015's already-complete 8
  stages, not a revision of them (the force math per se is unchanged, only
  where its direction input comes from). **A second real gap surfaced while
  continuing to scope stage 2, closed the same session**: the kernel (both
  the CPU-oracle TS functions and the WGSL kernel) applied anticipation and
  hazard avoidance unconditionally, while `crowdMovement.ts` gates BOTH
  behind `!holding` (`if (anticipating && !holding)`,
  `if (agent.hazardAvoidance && !holding)`) — a holding agent (browsing,
  queueing, checking out — the common case) should not swerve to anticipate
  a collision or flee a hazard. This discrepancy dates to ADR-0015 stages
  4/5, disclosed at the time as an accepted gap tied to holding not yet
  existing as a concept, but never revisited once stage 6 introduced
  holding as a first-class concept. Fixed in all three synchronized
  locations (`gpuSimCoreSocialForce.ts`'s two CPU-oracle functions,
  `gpuSimCoreShaders.ts`'s WGSL kernel) by wrapping both force-adds in
  `if (!isHolding)`. Two existing isolation tests needed redesigning (the
  established "target = own position + holding = true" isolation trick
  now conflicts with a gate that also keys off holding), and a
  decisive revert-verify pass caught one of the two new tests as
  initially vacuous (see `docs/CLAIMS_LEDGER.md` for the full account).
  Hardware-verified via a single-step isolation check (not the standard
  20-step trajectory — a genuine second-order neighbour-coupling effect
  would otherwise confound a holding agent's position over multiple
  steps, see the ledger entry for why). **Continuing stage 2's remaining
  scope, closed the same session**: extracted gap #6's three reusable
  derivation functions (`deriveHolding`/`deriveFreeSpeed`/
  `deriveWalkingHeading`) from `crowdMovement.ts`'s inline logic into
  named exports `stepCrowd` now calls itself (a pure refactor, verified
  behaviour-identical against the full app suite); added the missing
  `rawWalls: WallSegment[]` field to `FloorRuntime` (`WallIndex` is a pure
  closure with no way to yield its segments back out); built gap #4's
  index-recycling allocator (`gpuSlotAllocator.ts`, a single `sync(liveIds)`
  entry point — no standalone allocate/release in the public surface, since
  nothing calls them outside a full per-tick sync). **A third real gap
  surfaced while designing `advanceAgentsGpu`, closed the same session**:
  `uploadSpawns` was the only public write path for `targetsBuffer`/
  `speedBuffer`, but it also zeroes velocity — correct for a brand-new
  agent, wrong for a continuing one whose velocity is GPU-resident and
  whose target/speed change every tick (retargeting, hazard exposure,
  connector boarding). Added `uploadTargets`/`uploadSpeeds`, full-rewrite
  methods mirroring `uploadGroupIds`/`uploadHazardAvoidance`/`uploadHolding`.
  **Also found and fixed, while verifying the above on real hardware, a
  genuine regression in the earlier `routedHeading` commit**:
  `coreApi.webgpu.ts` was the one real-hardware spec that commit forgot to
  update — it never calls `uploadRoutedHeading`, so since that commit it
  had silently been testing a crowd that cannot move at all (zero desired
  velocity, no in-kernel fallback) against an assertion that says the
  opposite; caught only because this spec self-skips in every sandboxed
  run and had never actually executed since. Fixed by supplying a
  straight-line `routedHeading`, confirmed on real hardware (identical
  centre of mass without it, genuine convergence with it). **A fourth real
  gap found while designing gap #5's pooling, closed the same session**:
  the first `gpuSlotAllocator.ts` only did free-list bookkeeping (mark a
  departed id's slot free, hand it to the next new arrival) — insufficient,
  because the WGSL kernel processes every index in `[0, count)`
  unconditionally with no per-agent "active" flag. A freed-but-not-yet-
  reused slot inside `[0, count)` is a ghost: the departed agent's last
  known position, still exerting full repulsion/anticipation/hazard force
  on real neighbours every tick until something happens to overwrite it.
  Redesigned as genuine swap-compaction (the standard packed-array
  swap-remove technique): every departure swaps the topmost live slot into
  the hole it left, keeping live agents packed into exactly `[0, count)`
  with no gaps, at the cost of a live agent's **slot** (not identity)
  sometimes changing underneath it — `sync()` now also returns
  `relocatedIds` for exactly those. A relocated agent's position is
  re-established via `uploadSpawns`, extended with optional `vx`/`vy`
  fields (omitted, the default, means a genuine new agent starting from
  rest, unchanged for every pre-existing caller) so relocation can preserve
  its actual GPU-resident velocity from the same readback a live engine
  already does every tick, rather than silently zeroing it. Verified with 8
  Node tests including a hand-traced two-simultaneous-departures cascade
  (one relocation itself becoming a departure within the same `sync()`
  call) and a general "always packed, no gaps" property check; a decisive
  revert-verify (disabling the swap) reproduced exactly the 3 tests that
  depend on real compaction. The new `vx`/`vy` fields verified on real
  hardware — and caught their own test bug in the process: an exact-equality
  assertion (`toBe(0.8)`) failed because 0.8 has no exact float32
  representation, fixed to `toBeCloseTo`. **Stage 2 is now complete**: built
  `createGpuCrowdPlanePool` (gap #5 — one `GpuSimCore`/`GpuSlotAllocator`
  pair per plane, keyed by plane id, cell size derived from the widest of
  `interactionRangeMeters`/`anticipationRangeMeters`/the hardcoded 1m
  `formationRoomMeters`, since the neighbourhood-restricted kernel is only
  lossless when the grid covers every range that must stay exact and only
  `interactionRangeMeters` is checked at runtime) and `advanceAgentsGpu`, a
  real, independently-callable async alternate to `stepCrowd` for one
  plane's population — exit check before movement (identical to
  `stepCrowd`'s own early continue, no kernel involvement), the allocator's
  `sync()` per tick, a full-array-upload translation layer
  (`buildGpuCrowdUploadArrays`, pure and Node-tested) correcting a real,
  subtle discrepancy the naive translation would have missed (the formation
  force's actual CPU gate is "has a `groupFormation` slot", not merely "has
  a `groupId`" — a solo or non-moving grouped agent has the latter but not
  the former, and uploading its real `groupId` regardless would let the GPU
  kernel pull it toward `(0, 0)`), `uploadSpawns` for newly
  spawned/relocated ids only, `step`+`readback`, then the exact same
  `constrainMovement`/exit-tally logic `stepCrowd` uses reapplied to the
  GPU-produced positions. Verified: 10 Node tests (a fake in-memory
  `GpuSimCore` proves the orchestration — spawn/no-re-spawn-on-continuation/
  wall-constraint-reapplication — without needing real hardware; physics
  correctness is a separate concern), plus a real-hardware test comparing
  `advanceAgentsGpu` against `stepCrowd` for a mixed 6-agent, 30-tick
  scenario (a walking group, a solo walker, a holding/browsing agent, and a
  head-on collision pair) — matched within 1.1e-5m, an order of magnitude
  inside the 0.05m tolerance budgeted for accumulated floating-point drift
  over 30 ticks. An early version of that test's own "did anyone actually
  move" sanity check used an unrealistic threshold (assumed near-steady-
  state speed within a 0.5-simulated-second window, well under the 0.644s
  relaxation time) and failed on real hardware for that reason, not a
  pipeline defect — corrected once the real hardware numbers made the
  arithmetic error obvious. Self-applied ponytail-review caught the test
  file itself hand-rolling a second, simplified copy of the already-tested
  `GpuSlotAllocator` instead of importing the real one — replaced. **Stage 3 — worker device lifecycle + real runtime switch — is now
  complete**, done strictly additively so the ~35 existing files calling
  `engine.step()`/`.tick()` synchronously in tight physics loops (RiMEA
  scenarios, benchmarks) are completely unaffected: `SimulationEngine`
  gained `stepAsync`/`tickAsync` (identical to the sync methods when
  `movementBackend==="cpu-compat"`, the only entry point that can serve
  `"webgpu"` since a GPU readback is inherently asynchronous) and
  `setMovementBackend(backend, pool?)`, while the sync `step()`/`tick()`
  fail loud (ADR-0006: no silent downgrade) if called while
  `movementBackend==="webgpu"` — a caller in that mode has no way to know
  its GPU request was silently ignored otherwise. The worker
  (`simulation.worker.ts`) now genuinely acquires a GPU device once, at
  `init`, only when the client explicitly requests it
  (`runtime.movementBackend==="webgpu"`) — never reactively, per the
  project's own "empty city" lesson (`simulationThread.ts`) about never
  switching a _running_ simulation's path on an async signal — falls back
  to `"cpu-compat"` transparently on any failure (no `navigator.gpu`, no
  adapter, a rejected `requestDevice`), and listens for `device.lost` to
  fall back live mid-run rather than silently keep claiming a backend that
  is no longer real. The worker pushes an unsolicited
  `movement-backend-status` message (no request id — the client and
  `useSimulationWorkerController` both had to learn to route it outside
  the existing id-keyed request/response map) so the real, current backend
  is always known, not assumed. `App.tsx` gates the request behind a
  stable, mount-time-only `?gpumove` URL flag (same pattern as the
  existing `?mainsim` flag, for the same reason). **A real, disclosed gap
  found and fixed the same day**: the readiness panel's collapsed
  "engineering signals" dock (`AppInspector.tsx`) hardcoded
  `signals.slice(0, 4)`, and the movement-backend row sits around position
  9 in the full signal list — so the real runtime state this stage exists
  to surface was computed correctly but never visible in the UI. Fixed by
  always appending the movement-backend row to the docked list when it
  is not already among the first four, verified with a new
  `AppInspector.test.tsx` (2 tests, one for the append, one proving no
  duplicate row when it already lands in the first four — a decisive
  revert-verify confirmed each test depends on a distinct, non-overlapping
  behaviour) and confirmed on real hardware in both modes: default path
  shows "移动后端 / cpu-compat active @ 60Hz", `?gpumove` shows "移动后端 /
  webgpu active @ 60Hz" with the crowd genuinely growing (spawned/present
  counts climbing, the "实测" panel's live chart rising) and zero console
  errors — not a silently-idle "empty city". Stage 4 (full-pipeline
  measurement) is entirely unstarted.
- **Stage 3 gap closed (2026-09-26)**: this ADR's own text for stage 3 says
  "surface as an explicit, labelled toggle ... in the readiness panel" —
  what shipped was the `?gpumove` URL flag alone, real but with no click
  target anywhere in the app. Added a button next to the movement-backend
  row in `AppInspector.tsx`'s "engineering signals" dock: labelled ("GPU
  movement (experimental)"), shows its current requested state. It flips
  the same `?gpumove` flag and reloads rather than flipping React state,
  because that flag is deliberately read once at mount and never switched
  reactively (`App.tsx`'s own comment, the "empty city" lesson) — a new
  pure `toggleUrlFlag()` (`urlFlagToggle.ts`, 4 tests) does the URL
  rewrite, `window.location.assign` does the reload.
  **An initial version gated the button's `disabled` state on
  `webGpuProbe.supported` — a self-run 3-angle ponytail-review caught this
  as a real, disclosed-elsewhere-in-this-project class of bug**: that probe
  (`webgpuProbe.ts`) requests a device with no `requiredLimits`, while the
  worker's real GPU-movement device acquisition (`simulation.worker.ts`)
  requires `maxStorageBuffersPerShaderStage: 16` — a device satisfying the
  probe's looser request can still fail the worker's stricter one, which
  would have left the button enabled/labelled "requested" while the
  backend silently stayed cpu-compat (the same "looks green, isn't"
  pattern this project's 2026-08-31 entry already fixed everywhere else
  with fail-loud `requiredLimits` checks). Fixed by removing that gate
  entirely rather than reconciling the two probes: the worst case of never
  gating on it is a click that reloads and gracefully falls back — already
  the designed behaviour — with the movement-backend row remaining the
  honest source of truth regardless. The button is now disabled only when
  `?mainsim` forces the main-thread path (the only path that never honours
  `?gpumove` at all — a fact this app has already decided, not a hardware
  probe that can race or disagree with the worker's own check). Decisive
  revert-verify: temporarily restored the old `webGpuProbe.supported` gate
  and confirmed the new "stays enabled regardless of webGpuProbe's state"
  test (and, as a side effect, the click test) went red; restored the fix
  and both passed again. A second review finding (no dedicated test for
  `App.tsx`'s own `onToggleGpuMovement` glue calling `window.location`)
  was considered and declined — this codebase has never tested that class
  of one-line browser-primitive glue (`ValidationReportPanel.tsx`'s and
  `ScenarioDiffPanel.tsx`'s `window.open(...)` calls have none either),
  and `toggleUrlFlag`, the actual computation feeding it, is already
  tested. 4 `AppInspector.test.tsx` tests attach to this button (disabled
  under `?mainsim`, enabled and fires the callback on the worker path,
  stays enabled regardless of `webGpuProbe`'s state, label matches actual
  state in both directions). Confirmed on real hardware: clicked the
  toggle, page reloaded to `?gpumove=`, the movement-backend row read
  "webgpu active @ 60Hz" with a genuinely growing crowd (spawned 143,
  present 143), `aria-pressed="true"`, zero console errors; clicked again
  and the flag round-tripped cleanly back off. CPU stays the default
  throughout — this only ever adds a discoverable way to opt in, per
  ADR-0006.
- **Stage 4, narrowed and measured (2026-09-26)**: the plan for stage 4 was
  "measure actual frame time with GPU movement, CPU decision layer,
  readback, and three.js rendering all in the loop". The rendering half of
  that could not be measured honestly in this session: the browser
  automation environment used for every prior stage's real-hardware
  verification does not continuously composite the page when its pane is
  not the foregrounded window, and `requestAnimationFrame` — which
  `useSimulationWorkerController.ts`'s tick loop and three.js's own render
  loop both depend on — simply never fires under that condition (confirmed
  directly: a `requestAnimationFrame` callback armed and left running
  recorded 0 invocations after 5+ real seconds of idle wait, while the
  simulation kept advancing regardless via that same hook's `setInterval`
  watchdog fallback for exactly this kind of starved-rAF case). Given that
  hard constraint, **the user chose to scope stage 4 down to the
  non-rendering three-quarters of the loop** (GPU movement + CPU decision
  layer + readback) rather than fabricate a number for the fourth,
  or block on tooling neither this session nor the user control.
  - **Method**: a temporary, flag-gated timer (`window.__stage4Bench`,
    checked in `useSimulationWorkerController.ts`'s `advance()`) wrapped
    each real `client.tick()` call end to end — the same call this hook
    already makes every real frame (or watchdog tick), driving
    `SimulationEngine.tickAsync()` through the worker, which under
    `movementBackend:"webgpu"` runs the GPU movement step, the CPU decision
    layer, and the GPU readback, in that order, inside one call. No app
    code changes survived past the measurement: the instrumentation was
    added, used, and `git checkout`'d back out before this entry was
    written — `git status` is clean of it.
  - **Scenario**: the "Stadium Concourse" industry template (highest
    default arrival rate among the six, 320/min), run at real time (1×,
    after using 8× only to build up population faster, since `tickAsync`'s
    per-call cost scales with how much simulated time one call has to
    catch up — 8× numbers are not comparable to 1× numbers for this
    reason). Every real tick's wall-clock duration was logged paired with
    that tick's resulting `agentCount`, then bucketed by population range
    after the fact, so one continuous run covers the whole scaling curve
    rather than needing separately-launched runs per bucket. First tick of
    each run (cold start, includes one-time worker/pipeline setup cost)
    excluded from every bucket below.
  - **Results** (mean tick duration, ms; NVIDIA Lovelace, this session's
    real hardware):

    | Agents present | cpu-compat (default) | webgpu        |
    | -------------- | -------------------- | ------------- |
    | 0-100          | 1.70 (n=137)         | 31.76 (n=147) |
    | 100-250        | 5.49 (n=244)         | 30.81 (n=244) |
    | 250-400        | 18.74 (n=248)        | 43.14 (n=250) |
    | 400-600        | 26.96 (n=245)        | 47.54 (n=73)  |

  - **This is not the result the project's earlier GPU-kernel benchmarks
    would suggest, and it is reported exactly as measured.** `cpu-compat`
    is faster than `webgpu` at every population bucket actually reached —
    by roughly 18× at the low end, narrowing to roughly 1.8× by 400-600
    agents. `webgpu`'s cost is nearly flat (31.76 → 30.81ms) from 0 to 250
    agents, then climbs; `cpu-compat`'s cost grows faster with population
    but starts from a much lower floor. The clear read: `webgpu` mode
    currently pays a large, close-to-fixed per-tick cost (worker → GPU
    device → async submit → readback → `postMessage` back to the main
    thread) that is NOT the GPU kernel's own compute time (ADR-0015
    measured that in isolation at 0.4-0.5ms for 100k agents on this same
    class of hardware) — it is integration overhead this stage's own
    plumbing adds around that kernel. That overhead does not shrink as
    population grows, so at high enough agent counts `webgpu` should
    eventually cross over and win; **this session could not observe that
    crossover**, because this app's scenarios plateau in the few-hundred
    range under their own arrival/exit dynamics, and the engine's own
    `crowdBudget.maxAgents` hard-caps every scene at 2,000 regardless of
    scenario design — nowhere near the tens of thousands where this
    overhead should stop dominating.
  - **Neither backend hits the 16.6ms (60fps) budget once population
    passes roughly 250-300 agents in this measurement** (rendering not
    included — the real, full-pipeline number would only be worse). Below
    that, `cpu-compat` alone stays inside budget (1.70-5.49ms); `webgpu`
    never does across any bucket measured, including its lowest (30.81ms
    mean at 100-250 agents).
  - **What this does and does not license saying**: it licenses saying
    "webgpu movement is currently slower than cpu-compat, not faster, for
    every population this app's default scenarios and engine cap can
    reach" and "neither backend's non-rendering cost fits a 60fps budget
    past roughly 250-300 agents" — both measured, both on one specific
    machine, one scenario, one session. It does **not** license "the GPU
    core doesn't work" (ADR-0015's isolated kernel numbers stand
    unchanged) or "webgpu mode is broken" (it is precisely as fast as this
    integration currently makes it, doing real, correct work each tick).
    It also does not cover three.js rendering cost at all, which stage 4's
    original plan explicitly wanted included and this session's tooling
    could not measure — that half of stage 4 remains open, for a session
    with an actually-foregrounded browser window.
  - **Consequence for CPU staying the default (ADR-0006)**: this measurement
    is now a second, independent reason `cpu-compat` should stay the
    default beyond the policy reason ADR-0006 already gives — at every
    population this app can currently produce, it is also the faster
    choice, measured.

- **Per-floor hot-reload gap closed (2026-09-28)**: `GpuCrowdPlanePool
.forPlane` cached a `GpuSimCore` forever per `planeId`, ignoring the
  `rawWalls`/`world` it was called with on every later call — a scene edit
  that changed a floor's walls silently never reached the GPU kernel,
  since walls are fixed at `GpuSimCore` construction. Fixed with
  `planeFingerprint(rawWalls, world)`, a pure content key; `forPlane` now
  destroys and rebuilds when it changes, with a fresh `GpuSlotAllocator` so
  every walking agent looks "new" to it and gets re-spawned from its own
  (already-accurate) `SimulationAgent` position/velocity — no state lost,
  only the stale core's now-irrelevant buffers. A first version of the
  real-hardware test measured the wrong mechanism (hard wall-blocking comes
  entirely from the `wallIndex` parameter `advanceAgentsGpu`'s caller
  passes fresh every call, never from `plane.core`'s own geometry) and
  passed identically whether or not the fix was even present — caught by
  running it against a temporarily-reverted module and finding it green
  either way. Replaced with a direct check of `forPlane`'s own decision
  (`core` object identity across changed/unchanged/reverted-then-restored
  geometry, plus a distinct-`planeId`-never-shares-a-core case), confirmed
  decisive on real hardware against both the fixed and reverted module.
  **Self-reviewed (3-angle parallel ponytail-review) and it caught a real,
  previously-undisclosed cost**: `createGpuSimCore` does not just allocate
  ~15 GPU buffers — it also calls `createSortPipelines` (4
  `device.createComputePipeline` calls) and `createMovePipeline` (1 more),
  5 WGSL shader compilations total, typically the single most expensive
  step in standing up a GPU pipeline. Destroying and rebuilding on every
  content change pays that cost again, even though wall data is not baked
  into any shader — it is only buffer contents (`wallsBuffer` plus a
  `wallCount` field in `moveParamsBuffer`), so a cheaper `updateWalls()`
  API that rewrites those in place without touching any pipeline is
  possible. Not built this round: it is new public surface on `core-gpu`
  itself, a distinct piece of work from "make an edited wall reach the GPU
  kernel at all" (this entry's actual scope), so it is disclosed here as a
  known, undone optimization rather than attempted. The cost is paid only
  on the tick a floor's walls actually change while it is live-simulating
  (`forPlane` runs every movement tick, but rebuilds only on a genuine
  content change), not on every tick. A second, independently-flagged
  finding from the same review — `planeFingerprint` was recomputed from
  every wall's coordinates on every single `forPlane` call, including the
  overwhelming majority where nothing changed — was fixed: a reference
  check against the previous call's `rawWalls`/`world` short-circuits
  before the content comparison, since `buildFloors`/`buildFlightFloors`
  only produce new array/object instances on an actual hot scene update
  (ADR-0007), not every tick. Verified on real hardware (same-reference
  calls skip rebuilding; different-reference-same-content still correctly
  avoids rebuilding; genuinely different content still correctly rebuilds).
  A third finding (does the discarded `GpuSlotAllocator` need explicit
  disposal?) was checked and closed with no change needed: its public type
  is only `sync()`/`highWaterMark()`, pure JS bookkeeping with no GPU-side
  resources. A fourth (three near-identical adapter/device-acquisition
  blocks in the test file) was extracted into a shared
  `acquireGpuTestDevice()` helper.

- Touches: `packages/core-gpu/src/gpuSimCore.ts`, `gpuSimCorePipelines.ts`,
  `packages/app/src/simulationEngine.ts`, `simulation.worker.ts`,
  `simulationWorkerClient.ts`, `movementBackend.ts`, `App.tsx`,
  `useSimulationWorkerController.ts`, `simulationRuntimeArtifact.ts`,
  `appSignals.ts`, `AppInspector.tsx`, `urlFlagToggle.ts`,
  `gpuCrowdBackend.ts`
- Related: ADR-0015 (staged behaviour port to the WGSL kernel — now complete,
  all 8 stages), ADR-0002 (100k GPU rewrite, accepted tolerance-based
  determinism trade-off), ADR-0006 (WebGPU compute / labelled WebGL-CPU
  fallback, "no silent degradation")

## Context

ADR-0015 ported `crowdMovement.ts`'s full force model — exponential
repulsion with anisotropy and contact stiffness, group formation, sidestep,
anticipation, hazard avoidance, holding-state speed easing with exact
exponential relaxation, the no-walking-backward clamp, and the
no-overshoot-past-target clamp — to the WGSL `fused_move` kernel, stage by
stage, each verified on real hardware against a CPU oracle. That ADR was
explicit that it authorised _porting the math_, not wiring it into the app:
"Not authorised by this ADR: … touching `movementBackend.ts`'s or
`App.tsx`'s hardcoded `"cpu-compat"` selection." This ADR is that follow-on
authorisation, and the plan for doing it without violating this project's
"no silent degradation" rule (ADR-0006) or its fixed-step determinism
guarantee (CLAUDE.md: "仿真固定步长可复现（固定种子）").

### The gap is smaller than it first looks — and differently shaped

A research pass across `crowdMovement.ts`, `simulationEngine.ts`,
`movementBackend.ts`, `gpuSimCore.ts`, and `gpuSimCoreParity.ts` found the
real remaining work is almost entirely host-side plumbing, not new WGSL
algorithms — because of one structural fact: **floor transfers, elevator
transfers, vehicle stepping, exit tallying, and every analytics/HUD reader
need a real, current-tick `SimulationAgent[]` array on the CPU regardless of
which backend computed the movement.** `simulationEngine.ts`'s
`advanceAgentsCpu()` calls `stepConnectorTravel`/`stepElevatorTravel`
(`floorTransfers.ts`/`elevatorTransfers.ts`) and `stepVehiclesTick()`
_after_ the movement step, all reading/writing plain JS agent objects. There
is no version of this product where those systems move to the GPU too —
that would be a completely different, far larger undertaking with no
motivating gap to close. So a GPU-backed movement step has to read back
positions and velocities to the CPU every tick regardless of any raw
throughput goal; "zero readback" was never going to be preserved once GPU
movement is a real citizen of this engine, only in the standalone
step-kernel benchmark it was designed for.

That one fact eliminates two of what looked like three real algorithmic
gaps in the kernel:

- **Wall hard-constraint** (`constrainMovement`, `sceneGeometry.ts:128-148`
  — post-integration raycast, slide-along-wall, and clamp-to-start-position
  if still blocked) and **world-bounds clamp** (`clampPointToWorld`,
  `sceneGeometry.ts:150-162`): since positions come back to the CPU every
  tick anyway, these run exactly as they do today, just applied to
  GPU-produced proposed positions instead of CPU-produced ones. Zero new
  WGSL.
- **Exit/sink arrival + despawn** (`crowdMovement.ts:141-147`, checking
  `isExitBound(agent) && distance <= exitRadius(agent)` before movement,
  dropping the agent and recording `exitedSinkIds`): same reasoning — this
  check runs against last tick's position, before that agent is even
  uploaded to the GPU for this tick's step. No kernel involvement needed at
  all, GPU or not.

What's left is real, but scoped and mostly mechanical:

1. **`gpuSimCore.ts`'s public API is currently a genuine, disclosed-nowhere
   regression.** Its `moveBindGroups` only supplies bind-group entries for
   bindings 0–10 and its `moveParamsBuffer` is sized 68 bytes, but
   `createMovePipeline`'s layout (`gpuSimCorePipelines.ts:116-134`) has
   required bindings 11–14 (`groupIds`/`formationSlots`/`hazardAvoidance`/
   `holding`) and `buildMoveParamsData` now writes 100 bytes
   (`gpuSimCorePipelines.ts:145-178`) since ADR-0015 stages 2, 5, and 6 each
   added fields. Git history shows why: `gpuSimCore.ts` was last touched at
   the ADR-0015 **stage-1** commit; only `gpuSimCoreParity.ts` (a
   test/benchmark-only path, not part of `GpuSimCore`'s public surface) was
   kept in sync through stage 8. Calling `createGpuSimCore(...).step()`
   today would throw a bind-group validation error on real hardware. This
   must be fixed regardless of any wiring decision — it is already broken.
2. **No public write path for `groupIds`/`formationSlots`/`hazardAvoidance`/
   `holding`.** The WGSL bindings exist; `GpuSimCore`'s `uploadSpawns`
   (`gpuSimCore.ts:25-34`) only carries position/velocity/speed/target/
   radius. `gpuSimCoreParity.ts:251-279`'s always-bound-but-harmless-when-
   default pattern (group id `-1` = ungrouped, all-zero hazard vector,
   all-zero holding) is the right shape to replicate as a real API.
3. **No persistent per-tick readback.** `positionsBuffer()` returns a raw,
   unmapped `GPUBuffer` handle; there is no velocities readback at all in
   the public surface, and `readAggregates()` only maps cell counts. A real
   engine integration needs a `readback(): Promise<{positions, velocities}>`
   built once per `GpuSimCore` instance (persistent copy-destination buffers
   reused every tick), not the allocate-copy-map-destroy-every-call pattern
   `stepForParity` uses for its one-shot benchmark runs.
4. **No dynamic index recycling.** `capacity` is fixed at construction;
   `uploadSpawns` writes into caller-chosen indices with no despawn/compaction.
   The engine's own `SimulationAgent[]` is a dense array agents are removed
   from via `filter`. A GPU-backed plane needs a small index-slot allocator:
   assign each live agent a stable GPU-buffer slot, free it on despawn
   (exit, floor transfer departure, incapacitation is NOT despawn — those
   stay resident and set `holding`), reuse freed slots for new arrivals.
5. **No per-floor/plane instance management.** `advanceAgentsCpu` steps each
   active plane (real floors plus synthetic flight-lane planes from
   `buildFlightFloors`) with its own walls/router (`simulationEngine.ts:
913-950`). The GPU kernel has no floor concept — it is one flat
   neighbourhood over one buffer. This needs one `GpuSimCore` instance per
   active plane, since walls are fixed at construction and differ per
   plane. Flight-lane planes are transient (built fresh some ticks,
   per `buildFlightFloors`), so this needs a small
   create-on-first-use/reuse-by-floorId/destroy-when-plane-disappears cache,
   not a fixed pool.
6. **Two small host-side derivations need extracting into reusable
   functions**, both currently inlined once inside `stepCrowd`:
   `holding` (`crowdMovement.ts:163-166`: `incapacitated ||
holdingStates.has(lifecycleState) || (checkout && queueJoinedSeconds)`)
   and folding `flightSpeedMetersPerSecond`/`smokeSpeedFactor` into the
   single `speed[]` scalar the kernel reads (`crowdMovement.ts:149-159`).
   Trivial logic, just needs to exist as a function callable before GPU
   upload instead of only inline inside the CPU step.
7. **`replanAnticipation` throttle has no GPU equivalent and won't get one.**
   `crowdMovement.ts` recomputes anticipation only every 3rd tick
   (`simulationEngine.ts:931`) as a performance throttle; the kernel
   recomputes it every dispatch. Disclosed as an accepted behavioural
   difference (GPU mode's anticipation is _more_ responsive, not less
   correct) rather than ported — the throttle exists for CPU cost reasons
   that don't apply the same way to a GPU dispatch, and reproducing a
   stale-cache read inside WGSL to match a CPU perf hack would be exactly
   the kind of complexity this project's own review discipline flags.
8. **Worker-side GPU device acquisition.** `simulation.worker.ts` runs the
   60/10Hz loop today with no GPU involvement at all; nothing requests an
   adapter/device inside it. A module worker can hold `navigator.gpu` (this
   is standard, and the app already runs cross-origin-isolated for
   `SharedArrayBuffer`), but device acquisition, lost-device handling, and
   fallback-to-CPU-on-failure need to be built from nothing.
9. **A real runtime switch.** Today's `"cpu-compat"` string literals
   (`simulationEngine.ts:363`, `App.tsx:89,382`, `movementBackend.ts:28,66`,
   `movementBackendProbe.ts`, `useAppProbes.ts:106,109`) are all downstream
   _reporting_, not a mechanism — the actual hardcoding is
   `advanceAgentsCpu()`'s unconditional call to `stepCrowd(...)`
   (`simulationEngine.ts:928`). A real switch means a config flag threaded
   through `SimulationEngineConfig`, an `advanceAgentsGpu()` alternate,
   and those literals becoming genuine reads of runtime state instead of
   constants.
10. **Determinism must be disclosed, not silently downgraded.**
    `docs/adr/0002-100k-gpu-rewrite.md` already accepts tolerance-based
    (not bit-exact) cross-device determinism as a trade-off, and the
    existing hardware verification checks `< 1e-3` agreement, not equality.
    CPU mode remains bit-reproducible under a fixed seed
    (`docs/CLAIMS_LEDGER.md`: "Fixed-step seeded determinism | REAL |
    mulberry32 seeded loop"). GPU mode, once wired, is **not** a drop-in
    replacement for anything that depends on bit-exact reproducibility
    (SAME-BUILD determinism hashes, calibration reports) — it must ship
    labelled as GPU/tolerance-based wherever those exist, never silently.

## Decision

Wire the GPU kernel in as a **labelled, opt-in alternate backend**, staged
the same way ADR-0015 was — each stage independently verified on real
hardware before the next begins, autonomous execution with a check-in only
if a stage surfaces a deeper foundational gap (as ADR-0015 stage 6 did).

**Stage 1 — fix the broken public API + build the engine-ready surface.**
Bring `gpuSimCore.ts`'s bind group and `moveParamsBuffer` size up to the
current 15-binding/100-byte layout (this alone is a real bug fix,
independent of anything else in this ADR). Add
`uploadGroupIds`/`uploadFormationSlots`/`uploadHazardAvoidance`/
`uploadHolding` write paths mirroring `uploadSpawns`'s run-coalescing
pattern, defaulting to the same always-bound-but-harmless values
`gpuSimCoreParity.ts` uses. Add a persistent `readback(): Promise<{positions,
velocities}>` method built once at construction (reused copy-destination
buffers, not allocate-per-call). Verify against `stepForParity` as the
known-good oracle: same inputs, same outputs, on real hardware.

**Stage 2 — engine-side wiring for a single plane.** Add
`advanceAgentsGpu(plane)` as an alternate to the per-plane `stepCrowd(...)`
call inside `advanceAgentsCpu()`: derive `holding`, fold
`flightSpeedMetersPerSecond`/`smokeSpeedFactor` into `speed[]`, and compute
each agent's `router.direction()` for `routedHeading` (three small,
extracted, reusable functions per gap #6 above — the last of these calls
the CPU router the engine already builds per plane, exactly as
`crowdMovement.ts` does today, now confirmed to be a real, necessary, and
already-supported upload rather than an assumption), upload via the
index-recycling allocator (gap #4), step, read back, then run the
_existing_ `constrainMovement`/`clampPointToWorld`/exit-check logic against
the returned positions exactly as `stepCrowd` does today — no kernel
changes for wall/exit handling per the Context section above. One
`GpuSimCore` instance per plane with create/reuse/destroy lifecycle (gap
#5). Verified by running both backends against the same scene/seed and
comparing positions within the disclosed tolerance, plus the existing
RiMEA/benchmark suite re-run against GPU mode where currently CPU-only.

**Stage 3 — worker device lifecycle + real runtime switch.** Adapter/device
acquisition inside `simulation.worker.ts` with lost-device fallback to CPU
(never a silent hang — ADR-0006's own rule); a config flag threaded through
`SimulationEngineConfig`; the `"cpu-compat"` literals become real reads.
Surface as an explicit, labelled toggle (not a default) in the readiness
panel — CPU stays the default per ADR-0006, and any UI/report that assumes
bit-exact determinism (SAME-BUILD hashes, calibration reports) either
refuses GPU mode or labels its output accordingly.

**Stage 4 — full-pipeline measurement.** Only after stages 1–3 are real,
hardware-verified, and labelled: measure actual frame time with GPU
movement, CPU decision layer, readback, and three.js rendering all in the
loop — the number ADR-0015 explicitly withheld ("对外宣称只能引用步进核数字，
不得外推为全应用 60fps"). This is the first point at which any "N agents at
60fps end-to-end" claim becomes honest.

## What this ADR authorises and what it does not

**Authorised**: the four-stage plan above, each stage independently verified
on real hardware before claiming it works, CPU remaining the default
backend throughout.

**Not authorised**: replacing CPU as the default without an explicit,
separate decision; silently degrading determinism guarantees anywhere they
are currently promised; porting decision-layer systems (leader-following,
queueing, floor-transfer routing, vehicle stepping) to GPU — those stay
exactly where `crowdMovement.ts`/`simulationEngine.ts` already put them,
this ADR only moves the 60Hz force-and-integration math.

## Consequences

- The GPU kernel goes from "behaviourally ported, never touched by the app"
  to "a real, selectable backend" — but only once all four stages land;
  partial completion (e.g. stage 1 alone) is recorded as exactly that, not
  claimed as "wired in."
- `movementBackend.ts`'s old linear-model probe (`socialForceCpu.ts`/
  `motionGpu.ts`) is untouched by this work — it continues to validate only
  the older, simpler model it was built for, per its own long-standing
  disclosure.
- This does not change CLAUDE.md's "GPU 管 60Hz 移动，WASM 管 10Hz 决策，
  不得混层" constraint — the decision layer stays exactly where it is,
  unmodified; only which backend computes the 60Hz movement math changes.
