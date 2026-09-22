# ADR 0017: Multi-stage checkpoint queue networks, stage 1 — a standalone chained-FIFO model, not yet wired in

- Status: Accepted (2026-09-23)
- Gap-closure plan batch 5.2 ("多级排队网络")

## Context

The plan's own text for this batch is one line: "安检→验票→扶梯串联、优先
通道、故障级联" (security check → ticket gate → escalator, chained in
series; priority lanes; cascading failures), estimated at 1 week, with none
of the "改哪里/验收/代价" detail earlier batches got. Investigated before
writing this ADR: `servicePointSchema` already has a generic N-server,
service-time-distribution FIFO primitive backing it (`checkoutCounters.ts`),
but it is wired to exactly one call site — post-`browse` checkout at a shop
— and every part of it (`SimulationAgent`'s `checkout`/`enterStore`
lifecycle states, `browseUntilSeconds`, a queue-line direction computed from
the shop centroid) is fused to that one scenario. A pedestrian's decision
state holds a single `servicePointId`, not an itinerary — there is no
existing way for one journey to pass through two service points in
sequence. `environmentFactorSchema`'s `escalatorOutage`/`gateFailure`
entries fold into one global scalar multiplier
(`bioCityWeatherSystem`/`environmentEffects.ts`) with no `connectorId`/
`servicePointId` targeting at all — a service point cannot actually go
offline today, the same "schema exists, nothing live reads it" pattern this
session already found and fixed once for roads/vehicles (ADR-0016).

## Decision

Build stage 1 of this batch as a standalone, tested model — the same shape
ADR-0016 (vehicles), ADR-0013 (ORCA) and ADR-0014 (Moussaïd) already used
this session — deliberately **not wired into `simulationEngine.ts`, the
live decision backend, the worker, the viewport, or the editor**.

### What was built

`packages/app/src/checkpointQueueNetwork.ts`: a **new, standalone**
N-server-FIFO primitive, chained by a `nextStageId` a stage points at, with
scripted outage windows. Deliberately not built on `checkoutCounters.ts`
despite that module doing the same underlying thing — reusing it would mean
either overloading `SimulationAgent`'s pedestrian lifecycle states with
checkpoint semantics that don't fit, or refactoring a live, heavily-tested
production module neither of which this pass attempted. What is genuinely
reused: `sampleServiceSeconds` (Erlang-2, `behaviorDistributions.ts`),
already a generic distribution sampler with no mall coupling.

Schema, purely additive: `servicePointSchema` gains `nextServicePointId`
(optional — absent means "served here ends the chain," unchanged from every
scene written before this field existed) and `outageWindows` (default
empty array — never down, also unchanged).

**"故障级联" (cascading failure) is not a separate mechanism.** A stage in
an outage window simply stops admitting new parties (it still finishes
whoever it was already serving); a downstream stage that depends on it for
arrivals starves on its own, and floods once the outage ends — the natural
consequence of stages depending on each other's output, not a bespoke
propagation rule. `checkpointQueueNetwork.test.ts` proves this directly: ten
parties queued at a down "security" stage, none reach "ticket-gate" for the
whole outage window, then do once it ends.

### What this is not

- **No priority lanes.** Every stage is one FIFO queue; there is no
  eligibility or fast-track concept. The plan's own "优先通道" is not
  attempted this pass.
- **No branching.** A stage's `nextStageId` is a single id, not a choice —
  a linear chain, not a general routing graph.
- **No live fault model.** An outage is a fixed, scripted time window on
  the scene entity itself; nothing (a hazard, hardware failure event, or
  random process) can trigger one at runtime.
- **Not wired into the app.** No scene author-facing way to build a
  checkpoint sequence and watch pedestrians actually walk through it —
  `simulationEngine.ts`'s single-`servicePointId` decision state is
  unchanged. A scene can set `nextServicePointId`/`outageWindows` on a
  service point today and nothing in the live app will read them yet.

## Consequences

- `docs/superpowers/plans/2026-09-21-gap-closure-plan.md` batch 5.2's
  one-line description is replaced by this ADR and the module it produced;
  the remaining pieces (priority lanes, live wiring into the pedestrian
  decision backend, a runtime-triggerable fault model) are explicitly
  deferred as stage 2, not started.
- A future stage 2 needs its own design for the hard part this ADR did not
  attempt: how a pedestrian's decision state grows from one
  `servicePointId` scalar into an itinerary that can include a checkpoint
  chain, without breaking the existing single-checkout shop flow that
  scalar already serves.
