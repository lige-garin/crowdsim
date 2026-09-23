# ADR 0021: Chaining service points in the live decision backend

- Status: Accepted (2026-09-23)
- Builds on: ADR-0017 ("multi-stage checkpoint queueing... deliberately
  standalone... NOT wired into `simulationEngine.ts`, the live decision
  backend, the worker, the viewport, or the editor")

## Context

Continuing this session's pattern of closing gaps a completeness audit named
(the same shape as ADR-0020's vehicle wiring), the next standalone module
with zero live consumers was `checkpointQueueNetwork.ts`. Reconnaissance
before writing any code answered the obvious question first: **is
`checkpointQueueNetwork.ts` itself the right thing to wire in?**

It is not, and its own doc comment already says so: `CheckpointParty` is a
bare synthetic `{id: number, stageId, status, ...}` with no link whatsoever
to a `SimulationAgent` — no position, no floor, no walk target. Wiring it in
for real would mean building a second bookkeeping layer mapping
`SimulationAgent.id ↔ CheckpointParty.id` and translating its abstract
queue-admission ticks into physical walk targets — in effect reimplementing
what `checkoutCounters.ts` already does with real agents, real positions,
and a real line. `checkpointQueueNetwork.ts`'s own doc comment names this
exact tradeoff and declines it: "Reusing [`checkoutCounters.ts`] here would
mean either overloading pedestrian lifecycle states with checkpoint
semantics that don't fit, or refactoring a live, heavily-tested production
module — not attempted this pass." `checkpointQueueNetwork.ts` stays
standalone under this ADR too, the same status as the ORCA and Moussaïd
comparison layers (ADR-0013, ADR-0014) — a real, tested, independent model,
not infrastructure the live path needs.

What the completeness audit actually found unreachable was two scene-schema
fields: `servicePointSchema.nextServicePointId`/`outageWindows`. Confirmed
by direct inspection: `deriveSceneGeometry` (`simulationSceneConfig.ts`)
built the runtime `SimulationServicePoint` type by hand-picking `id`,
`floorId`, `position`, `radius`, `serviceSeconds`, `servers` — neither field
was copied, and `SimulationServicePoint`'s own type didn't declare them.
Write-only, exactly as ADR-0017's own text already said.

## Decision

**Reuse `checkoutCounters.ts`'s existing single-stage queue/serve mechanics
a second time per hop, rather than building a parallel system.**
`checkoutCounters.ts` is already keyed generically off `agent.servicePointId`
— pointing that one scalar at a different service point id a second time
"just works" for queueing and serving, with zero changes to that module's
own admission/service logic.

### Data (pure forwarding, same shape as ADR-0016's vehicle fields)

- `SimulationServicePoint` (`simulationDecisionBackend.ts`) gains
  `nextServicePointId?: string` and `outageWindows?: readonly
{startsAtSeconds, endsAtSeconds}[]`, both optional — absent means every
  service point behaves exactly as before this ADR.
- `deriveSceneGeometry` (`simulationSceneConfig.ts`) now copies both fields
  from the scene onto the runtime service point, next to the five fields it
  already forwarded.

### The redirect (the one piece of new logic)

`mallCrowdDecisionBackend.ts`'s `enterStore`-completion branch — previously
an unconditional `leaveDecision(agent)` once `browseUntilSeconds` passed —
now looks up the just-served service point's own `nextServicePointId`. If
it names a real service point, the buyer gets a `nextState: "checkout"`
decision targeting that point's position instead of a sink; walking there,
queueing and being served again is `checkoutCounters.ts`'s existing
`checkout`/`enterStore` cycle, unmodified, running a second time under a
different id. If there is no next point, or it names one that is not in the
scene (a dangling reference), the buyer leaves — the original behaviour,
now a fallback rather than the only path.

### The safety cap: `checkpointHopCount`

A new `SimulationAgent.checkpointHopCount` (optional, default 0) counts
redirects and caps them at `maxCheckpointHops = 8`
(`mallCrowdDecisionBackend.ts`). This is not a modelling number — a real
chain ("security, then the gate") is two or three hops — it exists solely
to bound a scene-authoring mistake (`A` chains to `B` chains back to `A`)
at a finite number of hops rather than walking that buyer in circles for
the rest of the run. `checkpointQueueNetwork.ts`'s schema validation already
rejects some malformed chains (`ADR-0017`'s `nextServicePointId` existence
check), but not a cycle — a cycle is still schema-valid, so this cap is a
genuine second line of defence, not a formality.

### Outages

`checkoutCounters.ts` checks a new `isWithinOutageWindow(windows,
elapsedSeconds)` (`behaviorDistributions.ts`) at both places a counter
admits someone: the batched admission loop (a counter in outage admits
nobody new, but keeps serving whoever it already had — the natural way a
downstream stage starves while an earlier one is down, without a separate
"cascading" mechanism, the same observation `checkpointQueueNetwork.ts`'s
own doc comment makes about its own outage handling) and the direct-service
fast path (an agent arriving at an empty line must not be served instantly
if the counter is down — they join the line instead).

**Ponytail-review caught the first draft duplicating this check.** It had
started as a private `isInOutage` inside `checkoutCounters.ts`, functionally
identical to a private `isDown` `checkpointQueueNetwork.ts` already had —
the review pointed out both files already depend on
`behaviorDistributions.ts` (`sampleServiceSeconds`), making it a genuinely
neutral place to share the check rather than duplicate it, the same
precedent this session's own `distanceToSegment` deduplication (one commit
earlier) and `boundedNelderMead.ts`/`csvParsing.ts`/`crowdStepUtils.ts`
already set. Fixed by moving it to `behaviorDistributions.ts` and pointing
`checkoutCounters.ts` at it. **`checkpointQueueNetwork.ts`'s own private
`isDown` was deliberately left as its own copy, not also switched to call
the shared function** — unlike `distanceToSegment`'s two call sites, which
had no stated reason to stay apart, this module's own doc comment states
across four separate ADRs now (0013, 0014, 0017, this one) that it intends
to stay entirely self-contained and not import from elsewhere. Half the
duplication (the production side) is gone; the other half stays, on
purpose, inside a module three ADRs have chosen to keep sealed.

## What this is not

- **Not `checkpointQueueNetwork.ts` wired in.** That module, and its
  `CheckpointStage`/`CheckpointParty`/`stepCheckpointNetwork`, are entirely
  untouched by this ADR and remain standalone, same as before.
- **Not priority lanes, branching, or a live fault trigger.** Those were
  already out of scope for `checkpointQueueNetwork.ts` itself (ADR-0017)
  and are equally out of scope here: a service point's `nextServicePointId`
  is a single id, chains are linear, and an outage is still only a scripted
  time window.
- **Not an editor control.** `EditorServicePoint.nextServicePointId`/
  `outageWindows` were already round-tripped (ADR-0017), but there is still
  no UI to set or correct them — a scene author can chain checkpoints today
  only by hand-editing JSON. This mirrors exactly the gap ADR-0020 first
  left open for crosswalks and then closed in a same-session follow-up; the
  same follow-up for checkpoints was not attempted this pass.
- **Not verified by clicking through the live app.** There is no editor
  control to author a chain from, so there was nothing to click. What was
  verified instead is the full production code path: `simulationCheckpointChain.test.ts`
  builds a real scene via `parseScene` and steps a real engine built by
  `createSimulationEngineFromScene` — the exact function both the worker and
  the main-thread controller call — and confirms a spawned agent physically
  walks from a shop to `security`, gets served, walks on to
  `boarding-gate`, gets served there too, and eventually exits. This is the
  production path, just driven by a test scene rather than a mouse click.

## Consequences

- `docs/superpowers/plans/2026-09-21-gap-closure-plan.md` batch 5.2's
  "接引擎/决策后端/worker/视口/编辑器" gap is closed for the decision-backend
  and worker/viewport halves (both ride the existing `SimulationServicePoint`
  plumbing with no further wiring needed); the editor half remains open,
  named above rather than silently folded into "done."
- 936 vitest tests (three in `checkoutCounters.test.ts` for outage gating on
  both admission paths, three in `mallCrowdDecisionBackend.test.ts` for the
  redirect/hop-cap-boundary/dangling-reference cases, two in the new
  `simulationCheckpointChain.test.ts` for the full engine path), cargo test,
  typecheck, lint and prettier all clean.
