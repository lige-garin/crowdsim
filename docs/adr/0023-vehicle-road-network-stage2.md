# ADR 0023: Vehicle road network, stage 2 — intersections, turning, and traffic signals

- Status: Accepted (2026-09-24)
- Builds on: ADR-0016 ("SP-3 stage 1... a vehicle moves along one road's own
  polyline, start to end... no network: no turns, no intersections, no
  routing across multiple roads... a future stage 2 needs its own design
  pass"), ADR-0020 (wiring stage 1 into the live engine)

## Context

ADR-0016 named this explicitly as deferred, not attempted: "a vehicle never
turns or crosses from one road to another; each road is simulated
independently" and "two vehicle-accessible roads that physically cross in
the scene are not aware of each other in this model." The user asked for
all ten items on a larger feature list to be built in order without
stopping; this is the first, and the one the project's own prior ADR named
as the largest scope cut from stage 1.

Investigated before writing this ADR (not assumed): `roadSchema` has no
network concept today — no shared endpoint IDs, no intersection entities,
no adjacency between roads. Two roads drawn touching in the editor are just
two polylines with coincidental coordinates; nothing records a relationship.
The floor-routing module (`floorRouting.ts`) is the better structural
precedent than the pedestrian grid router (`crowdNavigation.ts`): it already
treats named things (connectors) as edges between named nodes (floors), with
cost normalised to a common unit — the same shape a road network needs
(roads as edges, intersections as nodes), just within one plane instead of
across floors.

## Decision

Build **SP-3 stage 2**: roads that share an endpoint (within a snap
tolerance) are inferred as connected at an intersection, and a vehicle
reaching the end of its road turns onto a real, randomly-chosen connected
road instead of despawning — subject to one-way direction rules and, where
present, a traffic signal. This is the stage that turns "a road" into "a
road **network**": vehicles genuinely cross from one road to another at a
real junction, for the first time in this project.

### What "intersection" means here: inferred, not authored

No new "intersection" schema entity. An intersection is inferred purely
from geometry: two roads on the same floor whose endpoints (start or end of
their polyline) lie within `intersectionSnapMeters` (0.75 m — a plausible
"drawn to touch" tolerance, not measured) of each other belong to the same
node. This was a deliberate scope cut, weighed against adding an explicit
intersection entity with its own editor tool: authoring a new entity type
(with its own placement tool, parameter panel, and move/delete wiring —
the exact shape of work `crosswalkSchema` needed, ADR-0020's own appendix)
is real, separate work, and geometric inference gets a working network from
scenes authors can already draw today (two roads meeting at a point) with
zero new editor surface. The cost of this cut: an intersection cannot carry
its own identity, name, or right-of-way rule independent of the roads that
meet there — every property of "what happens at this junction" has to live
on a road (a signal) or fall out of the roads' own direction fields (which
turns are geometrically possible), not on the junction itself.

### Turning: a random walk through the network, not routing to a destination

When a vehicle reaches the end of its current road (in its direction of
travel), it looks up the node at that endpoint. If other vehicle-accessible
roads share that node, with a direction permitting entry there (a one-way
road cannot be entered against its own flow), the vehicle transitions onto
one of them, chosen uniformly at random via the same deterministic `random`
draw the engine already threads through `stepVehicles`. If no such road
exists (a real dead end, or every candidate is one-way against the vehicle),
it despawns exactly as stage 1 already does.

**This is not route planning.** A vehicle has no origin/destination pair
and no notion of "the shortest way to X" — it wanders the network turning
at random, the way stage 1's IDM already has no notion of _why_ a vehicle
is on its road, just how it should move along it. A full routing model
(vehicles assigned real destinations, choosing turns to reach them) is
further, larger work this ADR does not attempt — it would need an
origin-destination demand model this project has no data for, the same gap
this project's own OD-calibration modules were deleted over in 2026-08-30
for lacking real data to calibrate against (see CLAUDE.md's 孤儿模块
section). Undirected turning still delivers the concrete thing asked for —
a network with real intersections vehicles actually cross — without
fabricating demand data nobody has.

### Traffic signals: real, but two-phase and per-road

New `trafficSignalSchema`: `id`, `floorId`, `roadId`, `position` (projected
onto the road's own polyline exactly as a crosswalk's position already is),
`greenSeconds` (default 20), `redSeconds` (default 20), `offsetSeconds`
(default 0, for staggering signals that should not all turn together). Phase
is a pure function of the simulation clock (`elapsedSeconds`), the same
determinism `dayNightCycle.ts` already relies on — no separate state
machine, no per-signal random draw. A red signal is modelled as the same
stationary-obstacle IDM constraint a crosswalk or a stopped leader already
is: a vehicle decelerates smoothly toward the stop line, not a discontinuous
snap-to-stop on the one tick its position crosses the signal's arclength.

**Not modelled**: an amber/yellow warning phase (real signals give drivers
time to clear the intersection before it turns red; this model switches
directly between "vehicles must stop" and "vehicles may proceed"), protected
turn phases (a real signalised junction often lets one approach turn while
another is held; this model has one phase per _road_, not per turning
movement, so a green signal permits every geometrically-possible turn off
that road at once), and any coordination between signals at the same
inferred node (two roads meeting at a junction do not know about each
other's signal state — each road's signal is independent, so a scene author
who wants "only one direction moves at a time" has to author the timings by
hand via `offsetSeconds`, the same way ADR-0009's phased-arrival profiles
are hand-authored rather than solved for).

## What this is still not

- **Not routing to a destination.** See above — vehicles turn at random,
  not toward anywhere in particular.
- **Not an authored intersection entity.** No name, no independent
  right-of-way rule, no editor tool for "place an intersection" — a junction
  is exactly the roads that happen to meet there, inferred from geometry.
- **No editor placement tool for `trafficSignalSchema` either, this pass.**
  Unlike the crosswalk tool ADR-0020's appendix added (which needed a
  nearest-road search because `roadId` is required and guessing wrong means
  either a parse error or a signal pointing at empty space), a traffic
  signal's own `roadId` and `forwardArclengthMeters` carry the same
  requirement and would need the same click-to-place-and-snap machinery
  across the same dozen editor files (adders, canvas, controls, conversions,
  param grids, geometry, layout, move/remove, mutations, param actions,
  param panel, types, render plan). A scene author places one today by
  hand-editing the scene JSON. Deferred, not silently dropped — the same
  honest incremental split ADR-0016 (schema + engine) then ADR-0020's
  appendix (editor tool) already used for crosswalks.
- **Not congestion propagation between roads in any special sense beyond
  what turning itself already causes.** A queue backing up at a red signal
  can now, for the first time, back up onto the road behind it (since IDM
  car-following already handles a queue of any length) — this is a real
  consequence of the model, not a new mechanism built for it.
- **Not calibrated.** The snap tolerance, the signal defaults, and the
  turning-choice being uniform-random rather than weighted by road capacity
  or a driver's own preference are all engineering placeholders, the same
  standing IDM's own constants already carry (ADR-0016).

## Consequences

- The road-network graph is built fresh from each tick's own `roads` array
  inside `stepVehicles` (not cached) — road counts in any scene this project
  ships are small enough (tens, not thousands) that this is not a measured
  performance concern; if a future scene's scale makes it one, caching is a
  bounded, separate optimisation, not a design change.
- A future pass wanting real routing-to-destination, protected turn phases,
  or an authored intersection entity has this stage's graph-inference and
  signal-phase machinery to build on, not to redo.
