# ADR-0025: Phased evacuation — only the floor a real fire/smoke hazard is on evacuates

Status: accepted. Builds on ADR-0012 (`smokeHazards.ts`, fire/smoke hazards
with a floor, a position, a growing radius) and ADR-0010 (multi-floor).

## Context

CLAUDE.md has recorded this exact gap since the multi-floor work landed:
"分时段疏散仍未建模：报警后全场找出口，楼上的人经连接件下楼。真实建筑是否只
疏散着火层附近，是本项目没有依据的安全性宣称" — raising the alarm
(`engine.setEvacuation(true)`) has always sent every agent on every floor to
the nearest exit at once, whether or not that floor has anything to do with
whatever triggered the alarm. This is item 3 of the ten-item backlog picked
up after ADR-0023 (road network) and ADR-0024 (transit ridership).

## Decision

`smokeHazards.ts` already has everything phased evacuation needs: a hazard
carries its own `floorId`, and `smokeRadiusAt(hazard, elapsedSeconds)`
already computes whether it is currently affecting anything (0 before
`startsAtSeconds`, growing, 0 again after `endsAtSeconds`) — this is the
same function `applyHazardExposure` already calls every tick to slow and
expose agents. Reusing it rather than inventing a second "is this hazard
live" check keeps the two readings of "active" (does it hurt people right
now, does it justify evacuating this floor) from ever disagreeing.

`simulationEngine.ts` computes, once per decision tick,
`currentEvacuatingFloorIds(): Set<string | undefined> | undefined` — the
floor ids carrying at least one currently-active fire/smoke hazard.
**`undefined` means "every floor"**, not "no floor": a scene with no
hazards declared at all has no way to know which floor "near the fire"
would even mean, so `engine.setEvacuation(true)` on a hazard-less scene
still evacuates the whole building exactly as it always has — every
existing evacuation test in this project, none of which declare a hazard,
is a decisive regression on this point. The same fallback applies when a
scene _does_ declare hazards but none of them is currently active (not yet
started, or already burned out by `endsAtSeconds`) — with no live fire to
phase around at this exact moment, evacuating everyone stays the safe
default rather than evacuating nobody. Phasing only narrows the set once
there is a real, currently-modelled fire to phase around.

`mallCrowdDecisionBackend.ts`'s evacuation branch — previously
unconditional on `evacuationActive` alone — now also checks
`evacuatingFloorIds === undefined || evacuatingFloorIds.has(agent.floorId)`.
An agent on a floor that is not evacuating falls straight through to its
ordinary shopping/checkout/browsing logic, completely unaware an alarm
exists anywhere in the building — which is the actual behaviour "phased
evacuation" describes: everyone not on the affected floor carries on until
told otherwise.

### What this is still not

- **Not floor-above/floor-below buffering.** Real phased-evacuation
  building codes commonly also move the floor immediately above the fire
  floor (smoke rises through shafts and stairwells faster than it spreads
  sideways). This project has no stack-effect or smoke-through-connector
  model to justify picking a buffer floor from — evacuating only the
  hazard's own floor is the claim this data actually supports, not the
  fuller real-world procedure. Extending to a buffer zone once the model
  can justify one is a real next slice, not attempted here.
- **Not dynamic in the direction of adding floors mid-run.** If a fire
  hazard's `endsAtSeconds` passes and it stops being active, its floor
  drops out of `evacuatingFloorIds` on the very next decision tick — but
  nothing re-decides an agent already mid-`evacuate` on that floor to go
  back to shopping (the same "an evacuating agent is never re-decided into
  something else" rule this backend already had for evacuation once
  started). A newly-started hazard on a second floor, conversely, does add
  that floor to the evacuating set on the very next tick it becomes active
  — phasing responds to a spreading fire, it just never un-evacuates
  someone already moving.
- **Not a new alarm-raising path.** `setEvacuation(true)` is unchanged —
  still a single building-wide switch a scene, a test, or an operator
  flips. What changed is only which agents that switch actually moves,
  computed from hazard state at the moment each decision tick runs.

## Consequences

- `SimulationDecisionTickInput` gains an optional `evacuatingFloorIds`; a
  decision backend that does not read it (a custom or future backend)
  behaves exactly as `undefined` already does — evacuate everyone, the
  original semantics.
- `currentEvacuatingFloorIds()` is recomputed every decision tick from
  `hazards` and `elapsedSeconds`, not cached — the same "small, not a
  measured cost at this project's hazard counts" trade ADR-0023's
  road-turn graph and ADR-0024's transit service points already made.
