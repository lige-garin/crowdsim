# ADR-0024: Real transit ridership, stage 1 — pedestrians who walk to, wait at, and board a transit stop

Status: accepted. Builds on ADR-0016/ADR-0020 (`vehicleSimulation.ts`), ADR-0008
(checkout counters as service points), ADR-0021 (service-point chaining), and
ADR-0023 (the road network this session's prior item shipped).

## Context

`vehicleSimulation.ts`'s own module doc has said since ADR-0016 that "no code
anywhere in this project currently generates pedestrians who walk to and wait
at a transit stop." A bus already stops at a `transitStop` and dwells for a
scripted `alightingPerArrival` — riders get off — but nobody ever gets on: the
closest thing to demand-side modelling, `bioAgentBehavior.ts`'s
`chooseTransitStop` scoring heuristic, was deleted as an orphan (CLAUDE.md's
孤儿模块 section) because it was never the active decision backend, not because
transit demand itself had been modelled and rejected.

This is item 2 of a ten-item backlog ("十项按顺序不间断全部完成"), picked up
immediately after ADR-0023's road network.

## Decision

### Boarding reuses `checkoutCounters.ts`'s queueing primitive, unmodified

A transit stop's boarding queue is, structurally, exactly a checkout counter's
line: people arrive, queue in order, are admitted a few at a time, wait a
service duration once admitted, and give up if their patience runs out before
that happens. Rather than writing a second queueing implementation,
`simulationEngine.ts` synthesizes a `SimulationServicePoint` for every transit
stop each tick and merges it into the list already passed to
`decisionBackend.decideAgents` — `checkoutCounters.ts`'s `createCounterTick`
and its `decideCheckout`/`chooseCounter` never need to know a "counter" can
represent a bus stop; nothing in that module changes.

What differs per tick, and is why this is synthesized rather than static like
every other entry in `SceneGeometry.servicePoints`: `servers` — how many
boarding "slots" are open right now — must reflect whether a real vehicle is
actually standing at that exact stop, not a fixed capacity. `stepVehiclesTick`
already runs earlier in `simulationEngine.ts`'s own `step()`, so by the time
`decideAgents` is called the engine has this tick's (one-tick-lagged, the
same lag every vehicle/pedestrian interaction in this engine already carries)
vehicle list in hand. A stop counts as door-open when some vehicle's
`dwellRemainingSeconds > 0` and that vehicle's own `dwelledStopIds` — the list
`vehicleSimulation.ts` already appends to on arrival and never resets mid-dwell
— ends in that stop's id. `servers` is 1 door while open, 0 while closed:
`serviceSeconds = 60 / boardingCapacityPerMinute` (the schema field this
project already had and had never read) turns that single door into a real
rate, the same way a checkout counter's `servers` × `serviceSeconds` already
is one.

### Demand: a share of departing shoppers, not a new arrival reason

A person becomes a transit rider only at the point they would otherwise have
left through a door — every existing `leaveDecision` call site (finished
browsing without buying, a checkout chain (ADR-0021) run out, balked from a
full shop, given up on a blocked walk, reneged from a queue) is replaced with
a small `departDecision` wrapper: it looks at the nearest transit stop with
`pedestrianDemandShare > 0`, draws a per-agent deterministic hash
(`hashUnit`, the same primitive shop-choice and dwell-time already sample
from), and sends the agent to queue there instead of to a door if the draw
clears that stop's share. `pedestrianDemandShare` defaults to 0 — every scene
written before this field existed reads it as 0 and behaves exactly as before,
verified by a regression test.

**Not modelled**: a person arriving specifically to catch transit, never
having shopped at all. Every rider in this model is a shopper (or a browser,
or a would-be shopper who balked) on their way out who happens to catch a bus
instead of walking to a door. Wiring transit into the "fresh arrival, no
state yet" branch would need a new concept of _why_ an agent entered at all —
this project has no demand model for that (the same "no real OD data" reason
ADR-0023 gives for not routing vehicles to a destination) — so it is left for
a later stage rather than invented here.

### Boarding, and the loop it would otherwise create

Once served (the same `serve()` `checkoutCounters.ts` already uses for every
counter), the rider does not run the ordinary chain-or-leave logic
`mallCrowdDecisionBackend.ts` uses for a finished checkout — chaining onto a
`nextServicePointId` or calling `leaveDecision` for the nearest door would
walk someone who has just boarded a bus back across the map to a physical
exit. A new `kind: "transit"` tag on the synthesized service point lets
`enterStore`'s completion branch recognise this and instead emit an immediate
`leave` decision targeting the stop's own position — the rider vanishes there,
the same abstraction "walking out a door" already is for every other exit.

The one loop this would otherwise create: a rider who gives up waiting for a
bus (reneges via the counter's own patience mechanism) would, if routed
through `departDecision` again, potentially be offered the very same stop and
queue there forever. `createCounterTick`'s `leave` callback now checks whether
the service point being abandoned was itself transit; if so it calls the
plain `leaveDecision` (a real door) rather than `departDecision` — giving up on
a bus sends someone out on foot, not back into another bus queue.

### What this is still not

- **Not a second, transit-specific queueing engine.** Every admission,
  reneging, and service-time rule a checkout counter already has, a transit
  stop now has for free, unmodified.
- **Not vehicle-capacity-aware in the literal sense.** `capacity` (how many a
  vehicle actually holds) is not read here — only `boardingCapacityPerMinute`
  (a throughput rate) and whether a vehicle is currently dwelling. A vehicle
  that is, by the model's own numbers, already full still opens its doors and
  lets people board. Extending `VehicleAgent` with a live onboard count is a
  real next slice, not attempted here.
- **Not differentiated in `exitedCount`.** A transit boarder and a
  door-leaver both increment the same counter — the engine's existing
  `isExitBound`/exit-radius machinery cannot tell them apart without a new
  field, and nothing downstream currently needs to.
- **Not calibrated.** `pedestrianDemandShare`, the boarding-door count (1),
  and the transit-stop arrival radius are engineering placeholders, the same
  class of self-chosen constant `evacuationExitCrowdingMeters` already is.

### Two real bugs, found only by proving this end to end through the live engine

Both were caught by the same discipline: a decision-backend unit test can
prove the decision _logic_ is right, but only a real `createSimulationEngineFromScene`
run — start a scene, step it for real simulated seconds, read the snapshot —
proves the whole pipeline actually moves a person from arrival to boarding.
Building that end-to-end test surfaced two defects neither this ADR's design
nor the unit-level tests had any way to catch.

- **No vehicle in this project had ever dwelled at a stop.** `spawnVehicles`
  hardcoded `kind: "car"` for every vehicle on every road, and the dwell
  logic in `stepOneVehicle` is gated `if (vehicle.kind === "bus")`. Since
  nothing anywhere ever produced a `"bus"`, the entire alighting/dwell
  mechanism ADR-0016 built — `RoadRuntimeStop`, `dwellRemainingSeconds`,
  `dwelledStopIds`, `assumedAlightingRatePerSecond` — had been dead code
  since it was written; the module's own doc comment saying "for buses —
  stop at a transit stop" was describing something that had never actually
  happened in any scene, ever. Fixed with one line, inferred from the
  road's own geometry rather than a new schema field: a road carrying at
  least one transit stop (`road.stops.length > 0`) spawns buses on it,
  every other road spawns cars, exactly as before — the same "a fact about
  the geometry, not an authored flag" instinct ADR-0023 used for inferring
  a road-network junction from where roads happen to meet.
- **The "no shops" shortcut kept resetting a rider's queue position every
  tick, forever.** Before transit existed, an empty-shops scene routed
  every agent through `leaveDecision(agent)` unconditionally at the top of
  the per-agent loop — safe, because `leaveDecision` always produces
  `nextState: "leave"`, and a separate guard a few lines above
  (`if (state === "leave") continue`) stops that branch from ever
  re-firing for someone already leaving. `departDecision` can now also
  produce `nextState: "checkout"` (walking to, or queued at, a transit
  stop) — a state with no such early-exit guard — so every decision tick,
  for as long as an agent remained mid-checkout, the unconditional
  `activeShops.length === 0` branch fired again, re-issuing the exact same
  "walk to the stop" decision and clearing `queueJoinedSeconds` back to
  `null` before `checkoutCounters.ts`'s admission loop ever got a chance to
  see it queued. A bus could dwell at an open stop indefinitely and nobody
  would ever board — the queue would grow, the bus would depart empty, and
  a fresh one would arrive to the same fate. Fixed by excluding `checkout`
  and `enterStore` from that shortcut, so an agent already inside the
  transit (or checkout) flow falls through to its own dedicated branch
  further down instead of being re-decided from scratch.

Both were confirmed decisive by reverting each fix independently, rerunning
the failing scenario, and restoring it.

## Consequences

- `simulationEngine.ts`'s `exitRadius` closure — previously only searching
  `sinks` — now also searches the engine's own `transitStops` list, since a
  transit-stop `targetSinkId` is never present in `sinks` (deliberately, so
  ordinary door-exit and evacuation logic never sees a bus stop as a
  candidate exit).
- The synthesized transit service points are rebuilt every decision tick
  (small: one entry per transit stop, not per agent), the same "not cached,
  not a measured cost at this project's scene sizes" trade ADR-0023 already
  made for its road-turn graph.
