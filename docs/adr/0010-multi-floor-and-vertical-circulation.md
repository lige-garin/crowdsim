# ADR 0010: More than one floor, and how people move between them

- Status: **Proposed** (2026-09-20) — nothing here is implemented. This records
  what the change would cost and what has to be decided before it starts.
- Touches: scene schema, editor round-trip, router, engine, movement, renderer
- Related: ADR-0008 (entrance exits), ADR-0009 (demand profiles, groups)

## Context

The places this product is aimed at are not flat. A shopping centre is three
or four levels joined by escalators; a station has a concourse above the
platforms; a hospital puts wards above an atrium. Today every one of them has
to be modelled as a single plane, and the thing that most shapes their crowds
is exactly what gets thrown away: **vertical circulation**.

In a mall, the escalators decide the whole distribution — how many people
reach the third floor at all, and how long the second floor keeps them. Flatten
that into one plane and the model cannot say anything about it, because there
is nowhere for the constraint to live.

This has been avoided, not overlooked. It is the largest single change left in
the codebase, and the two-dimensional assumption is not in one place.

## What the flat assumption actually rests on

Measured, so the size of this is not a guess:

1. **`world` is `{ width, height }`** — `sceneSchemaBase.ts:234`. There is no
   third axis and no notion of a level anywhere in the schema.
2. **38 files in `packages/app/src` read `world.width` / `world.height`.**
   Every one of them is a place that assumes a single plane.
3. **The router builds one 2D field** — `createRouter(world, walls)`
   (`crowdNavigation.ts:81`) grids the world once and computes a distance field
   per target over it. There is no per-level graph to route through.
4. **No primitive knows which floor it is on.** Walls, zones, entrances,
   shops, service points and count lines all carry `x`/`y` and nothing else.
5. **`SimulationAgent` has `x`, `y` and no level**, so two people on different
   floors standing over the same plan coordinates would be shoulder to
   shoulder as far as the social force is concerned.

Point 5 is the one that decides the shape of the solution: this is not a
rendering problem that can be solved by drawing floors separately. It changes
what "next to" means.

## Decision (proposed)

**A layered graph, not a third dimension in the existing one.**

Keep each floor a 2D plane with its own route field, and join floors with
explicit connectors. Do not add `z` to the world grid: the grid is already the
dominant cost in routing, and a floor's worth of empty air between levels would
be paid for in every cell.

Staged, because each stage is separately useful:

1. **Levels in the schema (additive).**
   `world.levels?: { id, name, elevationMeters }[]`, and an optional
   `levelId?: string` on walls, zones, entrances, shops, service points and
   count lines. A scene with no `levels` is one unnamed level — every existing
   scene keeps working untouched. This stage alone lets a scene be _drawn_ per
   floor, which the editor cannot do today.
2. **Connectors (new primitive).**
   `connectors: { id, kind: "stair" | "escalator" | "elevator", from: { levelId,
point }, to: { levelId, point }, width, capacityPerMinute?, speedMetersPerSecond? }[]`.
   Stairs and escalators are a walking link with a different speed and a
   capacity limit — the same `width × peak specific flow` rule the entrances
   already use (ADR-0008), so this is not a new mechanism. **Elevators are the
   hard one** and are proposed out of scope for stage 2: a lift is a queue with
   a batch service, which is a different model again.
3. **Routing across levels.**
   One `Grid` and one set of route fields per level, with connectors as edges
   between them. Path cost becomes walking distance plus a connector's own
   penalty. The router's public shape (`direction`, `distance`) should not have
   to change.
4. **Agents carry a level.**
   `SimulationAgent.levelId`. Neighbour searches and the social force stay
   within a level: people on different floors do not push each other. A
   connector is then a place where an agent changes level, with the movement
   model treating the tread as a slow, narrow link rather than open floor.
5. **Rendering per level.** A floor selector, and either showing one level at a
   time or offsetting levels in 3D. Independent of 1–4 and can come last.

## Consequences

- **Additive at first, breaking later.** Stages 1–2 are schema additions and
  change no existing behaviour. Stage 3–4 touch the router and the movement
  step, where the performance work of the last two days lives — the 2.42 ms
  step at a thousand people must survive it, which means re-measuring after,
  not assuming.
- **38 call sites.** Each `world.width` / `world.height` reader has to be asked
  whether it means the whole site or one level. Most will mean one level.
- **Benchmarks and calibration are single-level.** Nothing fitted so far
  carries to a multi-level scene, and no claim should be made about one until
  it is measured again.
- **Elevators are excluded on purpose.** Batching them wrong is worse than not
  having them: a lift modelled as a staircase gives an answer that looks
  reasonable and is not.

## Open questions

1. Does a level's `elevationMeters` change walking speed on the connectors, and
   if so by what? (Slope, or an observed escalator speed.)
2. Is escalator capacity modelled as the entrance rule, or as a queue with a
   service time like a checkout?
3. Do people choose stairs by distance, by visibility, or by habit? The exit
   choice in an evacuation (ADR-0009's sibling in the decision backend) already
   had to answer a version of this and picked a crowding penalty; the same
   argument may or may not transfer.
4. Does a fire on level 3 evacuate levels 1 and 2? Real phased evacuation does
   not, and getting this wrong is a safety claim.

None of these has evidence in this repository. Any answer chosen now is a
guess, and per this project's rules it has to be written down as one.
