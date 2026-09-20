# ADR 0010: More than one floor, and how people move between them

- Status: **Proposed** (2026-09-20; rewritten the same day after the first
  version was found to be wrong — see "Correction" below). Nothing in it is
  implemented.
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

**Uncommitted and in progress as this is rewritten** (files dated 2026-09-20
23:13–23:15, carrying the note "ADR-0010, stage 1"): `sceneFloors.ts` and
`sceneEditorFloors.ts`. They unify `floorId` under one `floorIdSchema` across
ten primitives, and give the editor `activeFloorId` with `addFloor` /
`setActiveFloor` / `floorLabel`, drawing one floor at a time. Both say plainly
what they are not: "nobody can move between floors yet; connectors are stage 2
and do not exist. A floor here is a thing you can draw and look at, not
somewhere people can go."

So the data model exists in part, and is being completed now. What is missing
is the layer that runs it — a smaller and more specific problem than "design
multi-floor support", and the plan below is different because of it.

**Consequence for this document:** the table below describes what is
committed, so it under-reports stage 1 while that work is uncommitted. Re-read
it once stage 1 lands.

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

## Open questions

1. Does `elevationMeters` change walking speed on a connector, and by what?
2. Is escalator capacity the entrance rule (width × peak specific flow,
   ADR-0008), or a queue with a service time like a checkout?
3. Do people choose a connector by distance, visibility, or habit? The
   evacuation exit choice already had to answer a version of this and used a
   crowding penalty; whether the same argument transfers is untested.
4. Does a fire on level 3 evacuate levels 1 and 2? Real phased evacuation does
   not, and getting this wrong is a safety claim.

None of these has evidence in this repository. Any answer chosen now is a
guess, and per this project's rules it has to be written down as one.
