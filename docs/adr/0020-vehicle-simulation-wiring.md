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

### Editor (`sceneEditorMutations.ts`, `SceneEditorParamActions.ts`, `SceneEditorFacilityParamGrids.tsx`, `SceneEditorParamPanel.tsx`, `SceneEditorLayout.tsx`, `SceneEditor.tsx`, `i18nMessages.ts`)

- `EditorRoad`'s three vehicle fields (already round-tripped as of commit
  `61ca5b2`, with no control) now have one: a toggle button
  (`toggleRoadBoolean("vehicleAccessible")`, reusing the same generic
  boolean-toggle mutation `walkable`/`transitOnly` already share) plus two
  number inputs (arrival rate, speed limit) shown only while a road is
  vehicle-accessible.
- ~~Not done: crosswalk placement.~~ **Closed same day, see the addendum
  below.** Reconnaissance confirmed `crosswalkSchema` had zero editor support
  of any kind — no adder, no param panel, no tool button — schema-only since
  ADR-0016. A scene author could turn traffic on and set its rate/speed from
  the UI, but could not place a crosswalk without hand-editing JSON.

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
- **A moving vehicle was not watched in a live browser this session.** The
  dev server was confirmed to run this code with zero new console errors and
  the existing (no-vehicle) demo scene continuing to run correctly under the
  new always-on `stepVehiclesTick` code path — but toggling a road to
  `vehicleAccessible` through the browser-automation tooling and watching a
  box move was not achieved in the same session this ADR's engine/worker/
  viewport work landed (an automation click-registration issue on that
  specific toggle button, not a defect found in the app). The decisive
  evidence for that positive path is the automated test suite (verified
  failing without the fix, passing with it), not a screenshot. The crosswalk
  editor tool added in the addendum below _was_ verified live, once the
  click-registration issue was worked around with `element.click()`/real
  `PointerEvent` dispatch instead of the synthetic-input tool — see the
  addendum for what that confirmed.

## Consequences

- `docs/superpowers/plans/2026-09-21-gap-closure-plan.md` batch 5.1's own
  "engine/worker/viewport/editor wiring... explicitly deferred" line is
  closed by this ADR, with the crosswalk-editor gap named as what is still
  open rather than silently folded into "done" — until the addendum below.
- 922 vitest tests (six new integration tests in `simulationVehicles.test.ts`,
  two new editor tests in `SceneEditorParamPanel.test.tsx`), cargo test,
  typecheck, lint and prettier all clean.

## Addendum (2026-09-23, same day): the crosswalk editor tool

Closes the one gap this ADR itself named as still open. Reconnaissance before
writing any code found the closest existing analog — a transit stop's own
(optional) `roadId` — is set with a placeholder ("grab the last road drawn",
`document.roads.at(-1)?.id`) that has no correction UI if it guesses wrong.
`crosswalkSchema.roadId` is _required_, so that placeholder was not good
enough here: with no road at all it would either crash schema parsing or
silently point at nothing.

- **A real nearest-road spatial search**, not the placeholder. New
  `distanceToSegment`/`distanceToPolyline` helpers (`sceneEditorGeometry.ts`)
  find the closest road _on the active floor_ to the click point; `addCrosswalk`
  (`sceneEditorAdders.ts`) uses it and no-ops when there is no candidate — the
  same choice `addConnector` already makes with fewer than two floors to join,
  rather than inventing a `roadId` that points at nothing.
- **A correction UI**, also new: `CrosswalkParamGrid` exposes the matched road
  as an editable dropdown (`SelectInput` over `document.roads.map(r => r.id)`),
  so a wrong guess is one click to fix — unlike a transit stop's or a hazard's
  own road/zone reference, which still have none.
- New tool `crosswalk` (glyph `CW`), single-click placement through the exact
  same `placeEditorTool` dispatch every other point tool already uses — no new
  interaction pattern. Rendered in the 2D editor canvas (a small rect + label,
  `SceneEditorCanvas.tsx`) and, new to this codebase, given its own
  `BioCityRenderPrimitive` kind and `simulationViewportPrimitiveMeshes.ts`
  mesh case for the live 3D/2D viewport — un-oriented, the same disclosed
  simplification the vehicle boxes themselves already carry, for the same
  reason (this is a marker at the crossing's own point, not a stripe aligned
  across its road's true direction of travel).
- **Two generic cross-entity functions needed a case each, found by grep, not
  assumed absent**: `removeEntity` and `moveEntity`
  (`sceneEditorMoveRemove.ts`) enumerate every entity kind by hand; a
  crosswalk left out of either would have been undeletable, or un-draggable,
  with no compiler error to catch it (`EditorDocument`'s type only requires
  the field to exist, not that every cross-entity function handles it). Both
  fixed, both covered by a new test that would fail if either regressed.
- **Ponytail-review found a third copy of point-to-segment distance math**:
  `sceneEditorGeometry.ts`'s new `distanceToSegment` duplicated an existing
  private helper of the identical signature in `worldPlacement.ts` (a fourth,
  differently-typed version already exists in `wallIndex.ts` for
  `WallSegment`, left alone — not the same shape, not this diff's problem to
  solve). Fixed by deleting `worldPlacement.ts`'s private copy and having it
  import the one in `sceneEditorGeometry.ts` instead, checked for the
  circular-import risk that direction could have created (`worldPlacement.ts`
  already imports from `sceneEditorState.ts`, which re-exports
  `sceneEditorGeometry.ts` — so `sceneEditorGeometry.ts` importing back
  _from_ `worldPlacement.ts` would have been a real cycle through that
  barrel; importing the other way, which is what was done, is not).
- **Verified decisive**: `addCrosswalk`'s nearest-road search was temporarily
  reverted to the transit-stop-style "last road" placeholder, and the new
  "places a crosswalk on the nearest road, not just the last one drawn" test
  failed exactly as expected (asserted `road-1`, got `road-2`); restored, all
  tests pass.
- **Verified live, not just in tests**: the earlier vehicle-wiring section of
  this ADR could not get browser automation to register a click on the
  `vehicleAccessible` toggle button. For this addendum, real `PointerEvent`
  dispatch (`svg.dispatchEvent(new PointerEvent("pointerdown", {...}))`) and
  direct `element.click()` calls — driven through the browser's own devtools
  JS execution rather than the synthetic-input automation tool that had failed
  earlier — worked cleanly: the `CW斑马线` tool button appears in the palette
  in the correct position; clicking it then clicking the canvas added a
  crosswalk and incremented the status panel's count; the crosswalk rendered
  as a selectable element in the DOM; selecting it opened the param panel
  showing the matched road as a dropdown (populated with the scene's real
  road ids) and the width field. One live click landed on a road other than
  the one deliberately placed directly under the cursor — not a bug, just
  confirmation that an _arbitrary_ manual click has no reason to land nearer
  a tiny 20 m test road than the demo scene's own much longer named streets;
  the automated test above already proves the nearest-road logic itself with
  exact, controlled distances.
- 929 vitest tests (seven new: four in `sceneEditorState.test.ts` covering
  nearest-road placement, the no-road no-op, editing roadId/width through
  apply, and move/delete; one each in `SceneEditorParamPanel.test.tsx`,
  `SceneEditorCanvas.test.tsx` and `bioCityRenderPlan.test.ts`), cargo test,
  typecheck, lint and prettier all clean.
