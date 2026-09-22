# ADR 0010: More than one floor, and how people move between them

- Status: **Accepted and implemented** (2026-09-21), except lifts, which stay
  out of scope. What landed, and what it cost, is at the end under
  "What was built". Proposed 2026-09-20 (rewritten the same day after the first
  version was found to be wrong — see "Correction" below).
- Touches: router, movement, engine, editor UI, renderer
- Related: ADR-0008 (entrance exits), ADR-0009 (demand profiles, groups)

## Correction

The first version of this ADR said no primitive knew which floor it was on,
and proposed adding levels to the schema. **That was wrong.** It was written
from a search that looked at `world` and at `crowdMovement.ts` and stopped
there. What was already **committed** at the time:

- `scene.floors: Floor[]` — `floorSchema` with `id`, `name`, `level`,
  `elevationMeters`, **its own `world`**, `basemapIds`;
- a bare `floorId: idSchema.optional()` on **four** schemas: basemap, zone,
  store lot and shop. Worth noticing which four — they are the retail
  primitives, added for retail zoning, not the start of a floor model;
- `multifloorScene.ts` with `MultiFloorScene = { floors, connectors }`,
  `VerticalConnector.kind: "elevator" | "escalator" | "stairs"`,
  `flattenMultiFloorScene` and `summarizeMultiFloorScene`.

**Built in this change** (files dated 2026-09-20 23:13–23:15, carrying the
note "ADR-0010, stage 1"): `sceneFloors.ts` and `sceneEditorFloors.ts`. They
unify `floorId` under one `floorIdSchema` across the spatial primitives, and
give the editor `activeFloorId` with `addFloor` / `setActiveFloor` /
`floorLabel`, drawing one floor at a time. Stage 2 (connectors) and the runtime
that carries agents across them landed in the same change, so the "a floor is
only something you can draw" wording in the first draft is now false and has
been struck from the code comments.

So the data model already existed in part; the runtime layer that runs it is
what this ADR adds.

## What already exists, and what it can actually do

| Layer               | State                                                                                                                                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scene schema        | **Complete.** `floors[]`, per-primitive `floorId`, per-floor `world`, `level`, `elevationMeters`, `basemapIds`                                                                                                                                        |
| Editor model        | **Partial.** `activeFloorId` is stamped on new primitives, but it is referenced from no `.tsx` file — there is no UI to switch floors, so in practice everything lands on one                                                                         |
| Multi-floor runtime | **Written but orphaned.** `multifloorScene.ts` is imported by its own test and nothing else. `flattenMultiFloorScene` collapses one floor into a standalone scene, which is the honest summary of where the engine is: it can run one floor at a time |
| Router              | **Single plane.** `createRouter(world, walls)` grids the world once and computes one 2D distance field per target (`crowdNavigation.ts:81`)                                                                                                           |
| Movement            | **Single plane.** `SimulationAgent` has `x` and `y` and no floor, so two people on different floors above the same plan coordinates are shoulder to shoulder to the social force                                                                      |
| Engine              | **Single plane.** One `world`, one wall index, one sink list                                                                                                                                                                                          |
| Renderer            | **Single plane.** The 3D viewport draws one scene                                                                                                                                                                                                     |

38 files under `packages/app/src` read `world.width` / `world.height`. Each is
a place to ask whether it means the site or one floor.

## What is actually missing

1. **A floor on the agent.** `SimulationAgent.floorId`. Without it nothing
   else can be right — this is the one that decides the shape of the answer,
   and it is why this is not a rendering problem: it changes what "next to"
   means.
2. **Per-floor routing joined by connectors.** One grid and one set of route
   fields per floor, with connectors as edges between them.
3. **Connectors on the running path.** `VerticalConnector` is a type in an
   orphan module; nothing consumes it, and `scene.floors` has no connector
   list of its own.
4. **A floor switcher in the editor.** The model has `activeFloorId` and the
   UI never sets it.
5. **Per-floor rendering.** A floor selector, and either one floor at a time
   or levels offset in 3D.

## Decision (proposed)

**Keep the schema. Build the layer that runs it.**

The schema is not the problem and should not be redesigned. Concretely:

1. **Promote `multifloorScene.ts` or delete it.** It is currently a
   readme-shaped module: it describes multi-floor scenes to nobody. Either it
   becomes the thing the engine loads, or it goes, per the orphan rule already
   applied to eight other modules in this repo. Leaving it is the one option
   that is not allowed, because a reader finds `VerticalConnector` and
   reasonably concludes escalators are modelled.
2. **Connectors move into the scene.** `scene.floors` exists; a scene-level
   `connectors` array does not. Put them where floors are, not in a parallel
   structure that has to be kept in step.
3. **Agents carry `floorId`; neighbours stay within a floor.** The social
   force and the neighbour search never see across floors. A connector is then
   where an agent changes floor, with movement treating a tread as a slow,
   narrow link rather than open floor.
4. **Route per floor, join through connectors.** Cost is walking distance plus
   the connector's own penalty. The router's public shape (`direction`,
   `distance`) should not have to change.
5. **Elevators are out of scope**, on purpose and as before. A lift is a batch
   queue with a service time; modelling it as a staircase produces an answer
   that looks reasonable and is not.

Staged so the additive parts land first: agent floor → per-floor routing →
connectors → editor floor switcher → per-floor rendering.

## Consequences

- **The schema work is already paid for.** The remaining cost is in the
  engine, where the performance work of the last two days lives: the 2.42 ms
  step at a thousand people must survive it, which means re-measuring after,
  not assuming.
- **38 call sites** for `world.width` / `world.height`, each needing to be
  asked whether it means the site or one floor.
- **`flattenMultiFloorScene` will become a lie.** It exists because one floor
  at a time is all the engine can do. Once agents carry a floor, running a
  single flattened floor is no longer equivalent to running the building, and
  anything that used it must be re-derived rather than carried over.
- **Benchmarks and calibration are single-level.** Nothing fitted so far
  carries to a multi-level scene.

## What was built (2026-09-21)

All five points of the decision, in the order given. `multifloorScene.ts` went
the way the orphan rule points: **deleted**, along with the "2 楼层" readiness
line that counted two copies of the demo scene as a capability.

- **`scene.connectors`**, beside `scene.floors`. Stairs and escalators only:
  the schema **refuses** `kind: "elevator"`, so no scene can describe a lift
  that would then be simulated as a staircase. A connector that names an
  undeclared floor, or joins a floor to itself, is rejected.
- **`floorRouting.ts`** — a router per floor, connectors as the edges between
  them, everything costed in **metres of walking** so that "the shop upstairs"
  and "the shop at the far end" are comparable numbers. Dijkstra over
  connectors; the per-floor grid routing underneath is unchanged.
- **`floorTransfers.ts`** — a journey is legs: walk to the connector, cross
  it, walk on. `targetX`/`targetY` is always the leg being walked, so the
  social force, the wall constraint and the queueing never learn that floors
  exist. Someone crossing is held for the flight's travel time and is in no
  crowd meanwhile. Reaching the stairs on the way to an exit does not count as
  leaving the building.
- **One crowd per floor** in the engine, sorted in a single pass, so two people
  over the same plan coordinates on different floors do not push each other.
- **The editor draws one floor**, adds floors, and places stairs; the stage
  watches one floor, with its own crowd and its own heatmap.

### The answers chosen, and what they rest on

1. **Speed on a connector**: along-slope, at a literature-typical speed, with
   the flight twice the rise (30° pitch, standard for an escalator and mid-range
   for a public stair). Stairs 0.61 m/s up and 0.694 m/s down — Weidmann (1993),
   the same survey this project's level walking speed comes from. Escalator
   0.5 m/s, the usual fitted speed under EN 115. **Not calibrated here**; no
   stair flow has been measured for this project.
2. **Escalator capacity**: the entrance rule, width × Weidmann peak specific
   flow (ADR-0008). A stair mouth and a door are the same constraint, and
   reusing it adds no new mechanism to justify. People who cannot get on wait
   at the mouth, which is what a queue for an escalator is.
3. **Choosing a connector**: shortest total journey in metres, including the
   ride. **Not** the crowding penalty the evacuation exit choice uses — that
   penalty is itself a guess, and stacking a second guess on it would make the
   result harder to argue about, not better.
4. **Phased evacuation**: still not modelled. An alarm sends everyone to an
   exit, and people upstairs route down through connectors. Whether a real
   building would evacuate the other floors at all is a safety claim this
   project has no basis for.

### Cost

Measured on the corridor harness (881 people, best of six rounds, the method in
CLAUDE.md), with both variants inside one process so that drift hits them
equally:

| variant                            | ms/step, three runs |
| ---------------------------------- | ------------------- |
| one floor                          | 0.955, 0.983, 0.988 |
| two floors, everyone on the ground | 1.099, 1.101, 1.138 |

So declaring floors costs about **0.12 ms a step** at ~880 people, consistently
across runs.

**Do not read the absolute numbers across sessions.** The same one-floor case
measured 0.53–0.56 ms earlier the same day on the same machine and 0.96–0.99 ms
a few hours later, with no change to that path: the machine drifts far more
than the two variants differ. Only a pair measured in one run is worth
comparing. The 2.42 ms in CLAUDE.md is a different scene again and none of
these replace it.

## Open questions

1. Does `elevationMeters` change walking speed on a connector, and by what?
2. Is escalator capacity the entrance rule (width × peak specific flow,
   ADR-0008), or a queue with a service time like a checkout?
3. Do people choose a connector by distance, visibility, or habit? The
   evacuation exit choice already had to answer a version of this and used a
   crowding penalty; whether the same argument transfers is untested.
4. Does a fire on level 3 evacuate levels 1 and 2? Real phased evacuation does
   not, and getting this wrong is a safety claim.

None of these had evidence in this repository when they were asked. Questions
1–3 were answered above and are written down as what they are; question 4 is
still open, and nothing in the code pretends otherwise.

### Left for later

- **Lifts**, needing a batch-service model of their own.
- ~~**A connector as a place with a length.**~~ **Done, 2026-09-22 (stage 5).**
  See the update below.
- **Nothing recalibrated for a stack.** Every fitted parameter and every
  benchmark in this repository is single-floor, and no claim about a
  multi-floor building's flow should be read out of them.

## Update 2026-09-22: a connector is now a place with a length (stage 5)

The gap named above is closed: a connector's own geometry
(`floorRouting.buildFlightLane`) is a straight corridor `lengthMeters` long and
`width` wide, in coordinates of its own (0 at the `from` mouth, `lengthMeters`
at the `to` mouth) — not either floor's plan, since the two mouths generally
sit at different points on two different plans. Someone who boards is placed
on that lane and stepped by the ordinary per-floor social-force loop
(`crowdMovement`, `simulationEngine`) exactly as on any corridor: pushed by
whoever else is on the flight, held off its two side walls, walking at their
own literature stair speed (`personFlightSpeedMetersPerSecond`,
ADR-0011-aware) rather than a precomputed duration. Arrival is a matter of
distance now, not the `ridingUntilSeconds` timer this ADR originally shipped
with — someone squeezed by others on the stairs genuinely takes longer.

This is what "a busy escalator has a queue but no visible line on it"
actually meant: the line is now visible to the physics, because it is real
crowding on a real lane, not a queue counter feeding a fixed duration. It
unblocks RiMEA tests 2 and 3 (maintaining a defined walking speed up and down
a 2 m x 10 m staircase, A 2 p. 29), now built and passing —
`rimeaSuite.runStairSpeedTest`. It does **not** by itself unblock test 13 (the
fundamental diagram on stairs): that test's own geometry, read from the
guideline only after a first attempt assumed a periodic-corridor sweep like
test 4's, turns out to be a fixed 100-agent room-through-a-stair scenario
judged against a shaded, undigitised chart (A 4 p. 42-43) — a different,
still-open piece of work. See `rimeaSuite.ts` and `docs/CLAIMS_LEDGER.md`'s
2026-09-22 section for both the tests 2/3 result and that correction.

**One disclosed regression, in display only.** A rider's `floorId` is now the
flight's own synthetic id (`flightFloorId`), not either real floor. Nothing
that draws or buckets agents by floor —
`agentInstanceField.selectCrowdAgents`, the heatmap, `runAnalytics` — knows
what to do with that id, so a rider is not shown on, or counted toward the
density of, either floor while on the flight; they simply are not drawn for
the seconds they are on the stairs, then reappear at the far end. Before this
change they were shown frozen at the mouth for the whole ride, which was its
own, different fiction. Fixing the display to draw riders along the flight
itself is left for later; it was not needed to make the physics real, and
1000-person-scale movement still costs about what it did (`crowdMovement.ts`'s
own performance note is unaffected — no change was made to the level-floor
path).
