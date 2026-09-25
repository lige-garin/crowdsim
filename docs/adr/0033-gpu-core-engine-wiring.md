# ADR 0033: Wiring the GPU step kernel into the live simulation engine

- Status: **Stage 1 complete and hardware-verified** (2026-09-25): fixed
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
  where its direction input comes from). Remaining: stages 2 (the rest —
  index recycling, per-floor pooling, the engine-side `advanceAgentsGpu`
  function, the router-integration call site) through 4, unstarted.
- Touches: `packages/core-gpu/src/gpuSimCore.ts`, `gpuSimCorePipelines.ts`,
  `packages/app/src/simulationEngine.ts`, `simulation.worker.ts`,
  `simulationWorkerClient.ts`, `movementBackend.ts`, `App.tsx`,
  `useSimulationWorkerController.ts`
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
