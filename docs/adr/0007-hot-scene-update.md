# ADR 0007: Hot scene update — edit the city while the crowd keeps running

- Status: Accepted (2026-09-13)
- Touches: worker message protocol (`simulationWorkerClient.ts`), engine API
  (`simulationEngine.ts`), both simulation controllers, run reproducibility

## Context

Building in the 3D world now places items with one click (`useWorldBuilding`,
`worldPlacement.ts`). But the simulation has no way to change geometry while it
runs. Any new scene makes `useSimulationWorkerController` terminate the worker
and send a fresh `init`, and makes `useSimulationController` build a new
engine. Every agent is lost, the clock goes back to zero, and the crowd refills
from empty. Measured in the user's Chrome on 2026-09-13: placing one building
dropped the live count from 55 to 7. For a city builder this defeats the
purpose: you build to see how the crowd _reacts_, and a reset removes the crowd
that would react.

What makes a hot update feasible: the engine reads `CrowdSimScene` in exactly
one place. `createSimulationEngineFromScene` turns it into plain config
(sources, sinks, shops, service points, wall segments, world, speed, decision
backend). After that the engine only closes over those derived values, plus
`navigationFields` built from walls and sinks. The per-step agent grid is
rebuilt every step and holds no scene state.

What makes it risky:

- Agents refer to scene entities by id (`selectedStoreId`, `targetSinkId`) and
  hold copied targets (`targetX/Y`). Removing a shop or an exit leaves those
  references dangling. Today a removed shop freezes its browsers/queuers in
  place forever (`mallCrowdDecisionBackend` just `continue`s).
- The mall-crowd backend captures `brandStores` at creation. The WASM backend
  bakes every shop into `ShopDecisionModel`.
- Reproducibility (fixed seed, fixed step) currently means "one scene per run".

## Decision

1. **New engine method `updateScene(scene)`**, alongside `init`. It rebuilds
   every scene-derived value (sources, sinks, shops, service points, walls,
   speed / weather multipliers, navigation fields, decision backend). It keeps
   run state untouched: agents, `elapsedSeconds`, `stepCount`, spawned/exited
   counts, `nextAgentId`, rng, status, time scale, evacuation.
2. **New worker message `update-scene {scene}`.** It is queued through the
   existing serial message chain, so it lands between steps, never inside one.
   It replies with a snapshot like every other command. The inline client gets
   the same method.
3. **Hot only when compatible; otherwise the existing full re-init, labelled.**
   A hot update is used when the scene `id`, `world`, `seed` and runtime (WASM
   decision backend on/off) are unchanged and the scene still has an exit.
   Anything else — a different or imported scene, a new world size or seed, no
   exit, the WASM backend — goes through `init` exactly as today.
   The controllers decide; the UI never silently pretends a reset was hot.
4. **Agents are reconciled, not dropped.** Right after an update, and before
   the next step:
   - `selectedStoreId` no longer exists → the agent gives up on the store and
     heads for an exit (`leave`), the same as a balk.
   - `targetSinkId` no longer exists → retarget to the nearest remaining sink.
   - A checkout walker whose counter is gone → walk to the nearest remaining
     counter, or leave if there is none.
   - A scene with no exit at all is refused as a hot update (rule 3). If
     reconciliation ever meets one, those agents are reported as stranded and
     dropped, never counted as exits.
   - An agent now standing inside a new wall is left to the existing
     no-progress detection, which already removes stuck walkers. It is not
     teleported, because silently moving people would falsify trajectories.
     Buildings, blocking obstacles, blocked areas and non-walkable zones
     joined the collision set on 2026-09-14 (buildings with doorways at their
     entrances), so an agent caught inside a newly placed building leaves by
     its door or is removed by the same no-progress detection.
5. **Reproducibility is redefined, not abandoned.** A run is reproducible from
   (seed, initial scene, ordered list of `{stepCount, scene}` edits). The engine
   reseeds nothing on update. The trajectory recording keeps running; it no
   longer restarts on hot edits, only on full re-init (edits themselves are not
   logged — see the implementation notes). Dashboard and heatmap series continue across a
   hot edit, because they describe the same run.
6. **Scope.** In-world placement and its undo use the hot path first. "Apply to
   simulation" in the 2D editor uses the same compatibility rule, so it also
   becomes hot whenever the world and seed did not change.

## Consequences

- Placing a building keeps the crowd. The run's clock and counters keep going.
- The engine gains one public method and the worker one message type. The
  `SharedArrayBuffer` layout does not change.
- A backend that holds scene-derived state must be rebuildable. The mall-crowd
  backend is rebuilt with the engine's current rng stream carried over. The WASM
  backend is out of scope (rule 3: full re-init) until it can accept shop
  add/remove.
- Tests required: engine `updateScene` keeps agents and counters; removed shop
  → its browsers leave; removed sink → retarget or exit; determinism — the same
  seed plus the same edit list at the same steps gives the same state hash; the
  worker client round-trips `update-scene`; controller chooses hot versus full
  re-init; e2e: placing in 3D does not reset the agent count or clock.
- Not solved here: the GPU core (`gpuSimCore`) has no scene update either. It
  will need its own ADR when it joins the live path.

## Implementation notes (2026-09-13)

- Scene → engine config lives in `simulationSceneConfig.ts`
  (`deriveSceneGeometry`). Agent reconciliation lives in
  `simulationSceneReconcile.ts`. `hotUpdateBlocker` in `simulationEngine.ts` is
  the single compatibility rule, shared by the engine, the controllers
  (`useRunScene`) and `App.applyScene`.
- A swap that arrives while a movement backend's async step is in flight is
  held until that step lands. Otherwise the step would write back pre-swap
  agents and mix two sets of walls.
- A refused hot update (the worker rejects `update-scene`) falls back to the
  full re-init.
- Edits are **not** recorded (amended 2026-09-14). A `sceneEdits` log was
  kept on the live `TrajectoryRecording` with a full scene copy per edit, but
  nothing read it and the packed replay format never carried it, so it was
  removed. Replaying an edited run needs that log added back together with a
  reader for it; until then an edited run is reproducible only while it runs.
- Verified in Chrome: placing a building mid-run went from 18 s / 59 agents to
  21 s / 70 agents 4 s later, and undo went from 37 s to 40 s with no reset
  either way.
