# ADR 0016: Vehicle/traffic simulation, stage 1 — a standalone road model, not yet wired in

- Status: Accepted (2026-09-23)
- Builds on: ADR-0001 ("Vehicles and traffic are in scope... SP-3 gets its
  own spec before implementation")

## Context

ADR-0001 named vehicle/traffic simulation — road network, lanes,
intersections/signals, car-following, vehicle routing, congestion — as
in scope, as its own sub-project SP-3, and required SP-3 to get its own
spec before implementation. That spec was never written; SP-3 stayed a
named gap. `roadSchema`/`transitStopSchema` already existed
(`packages/scene-schema/src/sceneSchemaBioCity.ts`), but with zero live
simulation consumers: confirmed by direct investigation before this ADR
that every `scene.roads`/`scene.transitStops` reference in the app is
either rendering, a static commercial-analytics score, or a decision-backend
prototype (`bioAgentBehavior.ts`'s `chooseTransitStop`) wired to nothing but
its own test. No code anywhere interpolates a position along a road over
simulated time. `roadSchema.speedLimitMetersPerSecond` defaults to 1.4 m/s
— a walking speed, evidence this field was never meant for vehicles at all.

Gap-closure plan batch 5.1 asked for "vehicle agents, crossing conflicts,
bus boarding/alighting" in one line, with a 2–3 week estimate and none of
the "改哪里/验收/代价" detail batches 1–4 got. The user, asked how to
proceed given that gap, chose "complete everything in order" over stopping
to write a full spec first or picking a smaller item. This ADR is the
spec ADR-0001 asked for, written as the first thing done for batch 5.1,
scoped to what one further session can build and honestly test.

## Decision

Build **SP-3 stage 1**: a real, tested, literature-grounded vehicle model,
deliberately standalone — the same shape this session's ORCA and Moussaïd
comparison layers took (ADR-0013, ADR-0014) — **not wired into
`simulationEngine.ts`, the live worker, the viewport, or the editor** in
this pass. Wiring a second, structurally different mover (a 1-D
road-coordinate vehicle, not a 2-D social-force pedestrian; no
floor/queue/lifecycle semantics) into the live pedestrian engine is real,
separate work — matching ADR-0001's own framing that vehicles are
"a SECOND simulation paradigm... sharing the GPU + render foundation only."

### Schema (additive, zero blast radius on existing scenes)

- `roadSchema` gains `vehicleAccessible` (default `false`),
  `vehicleArrivalRatePerMinute` (default `0`, per direction), and
  `vehicleSpeedLimitMetersPerSecond` (default 8.33 m/s ≈ 30 km/h, a
  plausible urban placeholder, not fitted or measured). The existing
  `speedLimitMetersPerSecond` is left untouched — still walking-speed
  flavoured, still unread by anything live — rather than repurposed, so no
  scene that happens to read it changes meaning under this ADR.
- New `crosswalkSchema`: `id`, `floorId`, `roadId`, `position`,
  `widthMeters` (default 3). Registered in the scene root as `crosswalks`.
  A crosswalk is **not a pedestrian routing target** — pedestrians are not
  steered to use it, since roads are not part of the pedestrian navigation
  grid (confirmed: `crowdNavigation.ts`/`floorRouting.ts` have no concept of
  roads) — it is only a point a vehicle on `roadId` checks for an occupying
  pedestrian. Since roads default `walkable: true`, a pedestrian can already
  be standing anywhere on a road under the existing model; a crosswalk gives
  a vehicle a specific point to react to when that happens, not a new
  pedestrian behaviour.

### Simulation (`packages/app/src/vehicleSimulation.ts`)

- **Car-following**: the Intelligent Driver Model (Treiber, Hennecke &
  Helbing 2000) — the exact model ADR-0001 named ("car-following à la
  IDM/Krauss"). Parameters (`comfortDecelMetersPerSecond2`,
  `maxAccelMetersPerSecond2`, `minGapMeters`, `timeHeadwaySeconds`) are
  literature order-of-magnitude defaults, disclosed as not fitted to this
  project — the same disclosure ORCA's own parameters carry (ADR-0013).
- **A vehicle moves along one road's own polyline, start to end, in one
  direction it was spawned into.** No network: no turns, no intersections,
  no routing across multiple roads. This is the largest scope cut from
  ADR-0001's full list (which also named lanes, signals, congestion
  propagation, and routing) — a deliberate stage-1 boundary, not an
  oversight.
- **Crosswalk yielding** is modelled as the same IDM constraint a slower
  leading vehicle is: an occupied crosswalk ahead is a stationary obstacle
  with zero speed, so a vehicle decelerates toward it exactly as it would
  toward traffic ahead, rather than a separate rule.
- **Bus dwell**: a `kind: "bus"` vehicle treats its next not-yet-served
  stop the same way — a stationary obstacle it decelerates toward — then
  begins a dwell once within `busStopArrivalToleranceMeters` (2.5 m; must
  exceed IDM's own 2 m equilibrium following gap, since IDM only
  asymptotically approaches a stationary obstacle and would never cross a
  tighter tolerance). Dwell duration is
  `busDoorSeconds (8, an elevator-door-style placeholder) + alightingPerArrival / assumedAlightingRatePerSecond (1 person/s, a transit-engineering order of magnitude, not validated for this project)`.
  **Boarding is not modelled**: `transitStop.boardingCapacityPerMinute`
  exists in the schema but nothing generates a real pedestrian queue waiting
  at a stop to board (confirmed: no code anywhere does this — the closest,
  `bioAgentBehavior.ts`'s `chooseTransitStop`, is unwired dead code), so
  there is no real queue for a boarding capacity to gate. A bus's dwell is
  driven entirely by its scripted `alightingPerArrival`, every arrival,
  regardless of how many people are actually nearby.

### What this is not

- **Not a network.** A vehicle never turns or crosses from one road to
  another; each road is simulated independently, with its own spawn queue.
- **Not intersections or signals.** Two vehicle-accessible roads that
  physically cross in the scene are not aware of each other in this model.
- **Not live in the app.** No wiring into `simulationEngine.ts`'s
  `runFixedStep`, `SimulationSnapshot`, the worker, the viewport, or the
  editor. A scene author can set `vehicleAccessible: true` today and nothing
  will happen — the fields exist, the engine does not yet read them.
- **Not calibrated.** IDM's constants and the bus dwell formula are
  literature/engineering order-of-magnitude placeholders. No traffic count,
  no measured dwell time, no measured following gap was used to fit any
  number here — the same standing this project's ORCA/Moussaïd/elevator/
  escalator parameters already have, stated the same way.
- **Not a resolution of "no live pedestrian transit demand."** That gap
  (nobody walks to and waits at a stop) is unaffected by this ADR and
  remains exactly as it was.

## Consequences

- `docs/superpowers/plans/2026-09-21-gap-closure-plan.md` batch 5.1 is
  reduced from its one-line description to: schema + a tested, standalone
  car-following/crosswalk/dwell model, with engine/worker/viewport/editor
  wiring, road-network routing, and intersections explicitly deferred as
  **SP-3 stage 2**, not started.
- A future stage 2 needs its own design pass for the harder parts this ADR
  did not attempt: a road-network graph with turns, intersection
  right-of-way (signalised or not), and how a vehicle's own step (a 1-D
  road coordinate, not the pedestrian engine's 2-D per-tick field) plugs
  into `runFixedStep`'s existing floors/flight-lanes loop without forcing
  pedestrians and vehicles to share a stepping pass they have no physical
  reason to share.
