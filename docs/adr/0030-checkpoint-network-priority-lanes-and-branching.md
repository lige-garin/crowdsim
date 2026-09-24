# ADR-0030: Priority lanes and branching for the checkpoint queue network

Status: accepted. Builds on `checkpointQueueNetwork.ts` (gap-closure plan
batch 5.2).

## Context

`checkpointQueueNetwork.ts`'s own module doc has said since it was written:
"Deliberately out of scope for stage 1, and not attempted here: priority
lanes (the plan's own "优先通道") — every stage here is one FIFO line, no
eligibility or fast-track concept; branching networks (a stage's `next` is
a single id, not a choice of several — a linear chain, not a general
graph)." This is item 8 of the ten-item backlog, picked up after ADR-0023
through ADR-0029.

## Decision

### Priority lanes are dedicated capacity, not queue-jumping

`CheckpointStage.priorityServers` reserves some of a stage's own `servers`
exclusively for parties with `priorityEligible: true` — a genuine fast
lane, matching how a real airport priority security line actually works
(a dedicated lane, not merely "let priority people go first in the same
line"). The consequence this carries honestly: those seats never serve a
regular party even if the priority lane is empty and the regular line is
long, the same real-world observation a priority lane sometimes produces.
A priority-eligible party, conversely, only ever uses the reserved seats —
it does not additionally compete for the regular servers, so `servers`'s
total capacity is a strict partition, not an overlap. `priorityServers`
defaults to 0 (no priority lane at all), so every existing stage and every
existing test is unaffected.

Queue-jumping — a priority party admitted ahead of an earlier-arrived
regular party within the _same_ pool of servers — was considered and
rejected: it would need the stage to actively bump someone already
admitted, or refuse an available regular server while a priority party is
still walking over, both of which are real behavioural claims this
project has no queueing-theory or observed-security-line basis to make.
Dedicated capacity needs no such claim — it only assigns servers to two
independent queues.

### Branching is a weighted, deterministic choice, not a general graph

`CheckpointStage.branches` (optional) is a list of `{stageId, weight}`
next-stage candidates; when present it takes precedence over the existing
single-target `nextStageId`. A served party's own next stage is drawn from
`branches` deterministically — `hashUnit(seed, party.id, stage.id,
"branch")` against the cumulative weights, the same per-party hashing
this project's shop/counter choice logic already uses — so a replayed run
with the same seed sends the same party down the same branch every time.
`nextStageId` is unchanged and still works exactly as before for any
stage that does not declare `branches` — the existing linear-chain tests
are a decisive regression on this point.

This not a general routing graph: a stage's `branches` are still evaluated
once, at the moment service there finishes, from a fixed weighted list —
there is no notion of choosing a branch based on downstream queue length
or current load. A party cannot backtrack, and a branch is not itself
conditional on anything but the deterministic draw.

### What this is still not

- **Not load-aware branching.** A branch's weight is fixed at
  authoring time; it does not shift based on which downstream stage is
  currently shorter or in outage. Modelling that would need the network
  step to see every stage's live queue length before choosing, a real
  additional capability not attempted here.
- **Not a live fault model.** Still unchanged from stage 1: an outage
  remains a scripted time window, not something a priority lane or a
  branch choice can trigger or be triggered by.
- **Not wired into `simulationEngine.ts`.** `checkpointQueueNetwork.ts`
  remains standalone, the same "real, tested, not wired into the live
  decision backend" shape this session's ORCA/Moussaïd/vehicle-stage-1
  layers already took (ADR-0013, ADR-0014, ADR-0016) — ADR-0021 already
  covers the one real production consumer this project has for chained
  service points (`mallCrowdDecisionBackend.ts`'s own `nextServicePointId`
  handling), which this module does not touch or duplicate.

## Consequences

- `buildCheckpointStage` (converting a scene's `servicePoint` into a
  `CheckpointStage`) is unchanged — `priorityServers`/`branches` have no
  scene-schema field to read from yet, since this module stays standalone;
  a caller that wants either sets them directly on the `CheckpointStage`
  it constructs.
- `stepCheckpointNetwork`'s existing missing-stage guard now also checks
  every id named in a stage's `branches`, the same way it already checks
  `nextStageId` — a scene author's authoring mistake (a branch pointing at
  a stage that does not exist) fails loud instead of silently.
