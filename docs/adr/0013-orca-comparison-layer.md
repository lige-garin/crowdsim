# ADR 0013: ORCA as a comparison layer, not a movement backend

- Status: **Accepted and implemented** (2026-09-22)
- Touches: a new standalone module and its own benchmark harness; nothing in
  the live simulation engine, scene schema or editor
- Related: `docs/calibration/` (the social-force fit this compares against),
  `pedestrianFundamentalDiagram.ts` (Weidmann reference), ADR that is not
  written for `crowdMovement.ts` itself, because this ADR does not touch it

## Context

`crowdMovement.ts`'s own social-force model is this project's only crowd
steering algorithm. The gap-closure plan's batch 3.1 asks for a second,
well-known alternative — ORCA (Optimal Reciprocal Collision Avoidance, van
den Berg, Guy, Lin & Manocha, 2008/2011) — run on the same benchmarks
(fundamental diagram, bottleneck flow, passing distance) to produce a
difference table, not to replace social force as this project's crowd
model.

The reference implementation is the RVO2 library (C++, with a WASM port
possible). Bringing that in was rejected for the same reason this project
has rejected every other native-library route to a capability it could
write itself: a C++/WASM build target is a maintenance and CI burden this
repo does not currently carry (it builds exactly one Rust→WASM target,
`core-behavior`, with its own toolchain already), for an algorithm whose
core (a per-pair half-plane constraint plus a small 2D linear program) is
a few hundred lines, not a library's worth of code. Self-implementing it
is also what lets it share this project's own agent/scene types directly,
rather than translating across a WASM boundary for a research comparison
that is never in the hot path.

## Decision

**`orcaAvoidance.ts` implements ORCA as a standalone stepping function with
its own benchmark harness (`orcaComparison.ts`), used only to produce a
side-by-side comparison against social force. It is not wired into
`simulationEngine.ts`, the scene schema, the editor, or any runtime
toggle — there is no in-app way to run a scene "on ORCA" today.**

1. **The algorithm, faithfully.** For each pair of nearby agents, one ORCA
   half-plane constraint is built from their relative position and
   velocity, combined radius and a shared responsibility split (each agent
   takes half the avoidance, the paper's own reciprocal assumption) — using
   a time horizon for approaching-but-not-yet-colliding pairs and a shorter
   time-step horizon (an escape line off the intersection circle) for
   pairs already overlapping, exactly as the paper defines both cases. The
   new velocity is the point inside the max-speed disc closest to the
   preferred velocity that satisfies every constraint simultaneously,
   solved with the paper's own incremental 2D linear program
   (`linearProgram1` clips a single line to the disc and to every
   already-accepted line; `linearProgram2` adds lines one at a time,
   re-solving along a line the moment the running candidate violates it).
2. **Walls are not ORCA obstacles.** The paper's line-segment obstacle
   treatment (`linearProgram3`, a feasibility relaxation ranking
   constraints by distance when no velocity satisfies all of them) is not
   built. `stepCrowdOrca` instead reuses this project's own
   `constrainMovement` (`sceneGeometry.ts`) — the same hard wall clip
   `stepCrowd` already applies after integrating a velocity — so a wall
   still stops someone, just not through ORCA's own mechanism. This is a
   real scope cut, not a hidden one: it means a scene where the _only_ way
   through is a gap ORCA's agent-agent constraints alone cannot resolve
   (dense counterflow squeezed by geometry, not by other agents) is not
   ORCA's own behaviour in that regime, only this project's wall clip
   bailing it out. The three benchmarks this ADR's own comparison runs
   (open corridor, a bottleneck whose narrowing _is_ the wall clip's job
   either way, a passing-distance corridor) do not depend on obstacle-aware
   ORCA to be meaningful.
3. **Comparison, not integration.** `orcaComparison.ts` runs the same three
   measurements `fundamentalDiagramHarness.ts` and this project's own
   RiMEA/bottleneck scenarios already define — a periodic corridor's
   speed-density curve, a bottleneck's specific flow, and a head-on pair's
   passing distance — once under social force (calling the existing,
   unmodified harness) and once under `stepCrowdOrca`, and returns both
   sides plus the difference. Nothing about the existing harness or its
   callers changed to make this possible; the comparison is purely
   additive.
4. **Parameters are the paper's, not fitted.** `orcaParameters` (time
   horizon, neighbour distance, max neighbours) are the values the ORCA
   literature and the RVO2 library commonly ship with, not calibrated to
   this project's own Weidmann fit the way `socialForceParameters` was —
   disclosed in the module's own doc comment. A meaningful "which model is
   more accurate" claim would need both fitted to the same trajectory data
   this project does not have (`docs/calibration/`'s own "parameters not
   unique" caveat applies here too, doubled); what this ADR actually
   produces is "which model's _default_ behaviour looks more like
   Weidmann's curve", a narrower and honestly labelled claim.

## Consequences

- A second, independently useful implementation of a real published
  algorithm exists in the codebase, testable and comparable, without
  touching the live crowd model or its own calibration.
- `crowdMovement.ts`, `simulationEngine.ts`, the scene schema and the
  editor are all byte-for-byte unchanged by this ADR — the blast radius is
  two new files and their tests.
- The comparison this ADR produces is a snapshot ("on these three
  benchmarks, with each model's own literature-typical parameters"), not a
  standing regression gate — nothing currently re-runs it, and nothing
  currently fails a build if the two models drift apart differently than
  today's numbers.
- Future work that wants ORCA as an actual selectable movement backend
  (a scene-level toggle, editor UI, wired into `simulationEngine.ts`'s per-
  tick loop) is a separate, larger change this ADR does not authorise or
  attempt — it would need the obstacle handling this ADR explicitly cuts,
  and a decision about how `SimulationAgent`'s per-step contract
  (`flightSpeedMetersPerSecond`, hazard exposure, group formation, all of
  which are social-force-specific concepts today) applies to a different
  steering model.

## Testing

`orcaAvoidance.test.ts`: the LP solver against known-optimal points (an
unconstrained optimum, a single binding constraint, two constraints whose
intersection is the optimum); two agents approaching head-on produce
symmetric, collision-avoiding velocities; an agent with no neighbours
returns its own preferred velocity unchanged; an already-overlapping pair
gets pushed apart (the escape-line branch) rather than the steady-state
one. `orcaComparison.test.ts`: both models produce a finite, non-zero
speed on the same corridor at the same density; the comparison's own
shape (both sides present, a computed difference) is asserted directly
rather than a specific number, since neither model is fitted here.
