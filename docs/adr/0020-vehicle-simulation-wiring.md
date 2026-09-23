# ADR 0020: Wiring SP-3 stage 1 vehicle traffic into the live app

- Status: Accepted (2026-09-23)
- Builds on: ADR-0016 ("a real, tested, literature-grounded vehicle model,
  deliberately standalone... not wired into `simulationEngine.ts`, the live
  worker, the viewport, or the editor in this pass")

## Context

A completeness audit of the project (2026-09-23, see `docs/CLAIMS_LEDGER.md`'s
seventh entry) asked what was built this session but never reached a user.
ADR-0016's own "what this is not" section named the answer directly: a scene
author could set `road.vehicleAccessible: true` and nothing would happen —
the fields existed, `vehicleSimulation.ts`'s `stepVehicles` was real, tested
and unused, `simulationEngine.ts` never called it. This ADR does the wiring
ADR-0016 deferred, and only that: no road network, no intersections, no
crosswalk-placement editor tool. Reconnaissance before writing any code
confirmed there was no existing precedent in this codebase for streaming a
second, non-pedestrian entity kind from the worker to the viewport — vehicles
are the first, so this ADR also records the pattern chosen for that.

## Decision

### Engine (`simulationEngine.ts`, `simulationSceneConfig.ts`)

- `simulationSceneConfig.sceneRoadRuntimes(scene)` builds a `RoadRuntime[]`
  from every `vehicleAccessible` road (`buildRoadRuntime`, unchanged from
  ADR-0016), stamping each with `floorId` via `resolveFloorId` — the same
  base-floor fallback every other scene-derived geometry
  (`sceneHazardRuntimes`, `sceneConnectorRuntimes`) already uses. Added to
  `SceneGeometry`/`deriveSceneGeometry` next to those two.
- `SimulationEngineConfig.roads` and `SimulationSnapshot.vehicles` are new,
  both optional — absent means `[]`, the same convention
  `evacuationClearSeconds`/`incapacitatedCount` already use, so the many
  existing callers that build a snapshot-shaped object for a run with no
  vehicles need not invent one.
- `stepVehiclesTick()` (called once per tick, inside `advanceAgentsCpu`,
  after the connector/elevator steps) copies the exact pattern this engine
  already uses for pedestrians: **one `stepVehicles` call per floor**, each
  fed only that floor's own roads and that floor's own pedestrians
  (`agents.filter((agent) => (agent.floorId ?? baseFloor()) === floorId)`).
  This is not cosmetic — a naive single flat call would let a pedestrian on
  floor 2 occupy a crosswalk on floor 1's road at the same (x, y), the exact
  failure class ADR-0010's own ground-floor-vs-flight-lane split exists to
  prevent for pedestrian-pedestrian collision. No-ops when `roads` is empty,
  so the overwhelming majority of scenes (no vehicle-accessible road) pay
  nothing for this — verified by a decisive test (temporarily removing the
  call and confirming five of six new tests fail).
- `replaceGeometry` rebuilds `roads` from the new scene and drops any
  vehicle whose road no longer exists — the same choice this engine already
  makes for a pedestrian standing on a floor an edit removed. No
  `exitedCount`-style tally is owed here: `stepVehicles` itself already
  despawns a car at its road's end with no counter (ADR-0016), so a hot-edit
  drop is not a new kind of silent loss, just the existing one happening for
  a different reason. `reset()` clears `vehicles`, matching `agents`.

### Worker (`simulation.worker.ts`, `simulationWorkerClient.ts`)

- No new wire format. `SimulationSnapshot.vehicles` rides the existing
  `postMessage` snapshot channel every command response already carries —
  confirmed by reconnaissance that this channel is a plain structured-clone
  of the whole snapshot object, not a field-by-field allowlist, so a new
  optional field needs no changes on either side of the worker boundary.
  The `SharedArrayBuffer` overlay (built for thousands of pedestrians at
  60 Hz) is deliberately untouched: a scene's vehicle count is bounded by
  its arrival rates on however many vehicle-accessible roads it declares —
  tens, not thousands — so the extra plumbing a second shared-memory lane
  would need was not worth it for this volume.

### Viewport (`useSimulationViewportRenderer.ts`)

- A vehicle's own small, fixed-capacity `InstancedMesh` (64 boxes,
  `vehicleViewportCapacity`), separate from the pedestrian `agents`/`figures`
  meshes — the same compat-path technique the 2D pedestrian dot already
  uses, fed from `snapshot.vehicles` each frame and floor-filtered by
  `floorId` the same way `selectCrowdAgents` floor-filters pedestrians.
- **Disclosed simplification: un-oriented.** A vehicle box does not turn to
  face its direction of travel — computing a heading would need either a
  velocity history or the road geometry threaded into the render layer,
  neither of which existed and neither of which this pass added. This is a
  position update, not a vehicle visual model, the same disclosed
  simplification the existing 2D pedestrian dot already carries for exactly
  the same reason.

### Editor (`sceneEditorMutations.ts`, `SceneEditorParamActions.ts`,

`SceneEditorFacilityParamGrids.tsx`, `SceneEditorParamPanel.tsx`,
`SceneEditorLayout.tsx`, `SceneEditor.tsx`, `i18nMessages.ts`)

- `EditorRoad`'s three vehicle fields (already round-tripped as of commit
  `61ca5b2`, with no control) now have one: a toggle button
  (`toggleRoadBoolean("vehicleAccessible")`, reusing the same generic
  boolean-toggle mutation `walkable`/`transitOnly` already share) plus two
  number inputs (arrival rate, speed limit) shown only while a road is
  vehicle-accessible.
- **Not done: crosswalk placement.** Reconnaissance confirmed
  `crosswalkSchema` has zero editor support of any kind — no adder, no
  param panel, no tool button — schema-only since ADR-0016. A scene author
  can now turn traffic on and set its rate/speed from the UI, but cannot yet
  place a crosswalk without hand-editing JSON; a vehicle-accessible road
  with no crosswalk drives correctly, just never yields to anyone. Left for
  a follow-up: this ADR's job was closing the "nothing happens at all" gap,
  not building the marked-crossing drawing tool that ADR-0016 never asked
  for either.

## What this is not

- **Still not a road network.** A vehicle still only ever traverses the
  single road it spawned on; ADR-0016's stage-2 scope (turns, intersections,
  a routing graph) is unaffected and unattempted here.
- **Not a re-verification of the IDM/crosswalk-yield physics.** That is
  unit-tested at the module level (`vehicleSimulation.test.ts`, unchanged by
  this ADR). The new integration tests (`simulationVehicles.test.ts`) prove
  the engine wiring — gated correctly by `vehicleAccessible`, moves over
  time, floor-labelled correctly on a two-floor scene, cleaned up on a hot
  edit and on reset — not the car-following math itself. A live end-to-end
  test of "a real pedestrian, routed by the decision backend, physically
  standing on a crosswalk, visibly slows a real vehicle" was not written:
  the decision backend has no way to pin a pedestrian to an exact coordinate
  deterministically, and a statistical/flaky substitute was rejected in
  favour of leaving this gap named rather than papering over it with a test
  that would not actually be decisive.
- **Not verified pixel-for-pixel in a live browser this session.** The dev
  server was confirmed to run this code with zero new console errors and the
  existing (no-vehicle) demo scene continuing to run correctly under the new
  always-on `stepVehiclesTick` code path — but drawing a new
  `vehicleAccessible` road through the browser-automation tooling and
  watching a box move was not achieved in this session (an environment
  click-registration issue on this particular toolbar control, not a defect
  found in the app). The decisive evidence for the positive path is the
  automated test suite (verified failing without the fix, passing with it),
  not a screenshot.

## Consequences

- `docs/superpowers/plans/2026-09-21-gap-closure-plan.md` batch 5.1's own
  "engine/worker/viewport/editor wiring... explicitly deferred" line is
  closed by this ADR, with the crosswalk-editor gap named as what is still
  open rather than silently folded into "done."
- 922 vitest tests (six new integration tests in `simulationVehicles.test.ts`,
  two new editor tests in `SceneEditorParamPanel.test.tsx`), cargo test,
  typecheck, lint and prettier all clean.
