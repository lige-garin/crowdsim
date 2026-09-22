# ADR 0012: Fire and smoke — local exposure, not a scene-wide multiplier

- Status: **Accepted and implemented** (2026-09-22)
- Touches: scene schema, engine per-tick movement, decision backend, editor UI
- Related: ADR-0008 (entrance exits, the crowding-penalty precedent for a
  self-chosen dose model), ADR-0010 (floors — a hazard is scoped to one)

## Context

`hazardSchema` has carried `fire`/`smoke` kinds, a position, a radius, a
severity, a `speedMultiplier`, a `visibilityMultiplier` and a `riskScore`
since well before this ADR — CLAUDE.md's own history records it plainly:
"schema 里有 `hazards`（fire/smoke），但 `crowdMovement`、
`mallCrowdDecisionBackend`、`simulationSceneConfig` 里一次都不出现
hazard——火只画在图上" (the schema has hazards, but the movement model, the
decision backend and the scene-to-engine pipeline never mention one — a fire
was only ever drawn on the map).

That was half right. Investigating this ADR found a **second, older
mechanism already live**: `bioCityWeatherSystem.ts`'s
`hazardToEnvironmentFactor` converts every active hazard — any kind, not
just fire/smoke — into a scene-wide `EnvironmentFactor`, and
`environmentEffects.calculateEnvironmentImpact` folds its `speedMultiplier`
into the **one number the whole scene's `speedMetersPerSecond` is set from**,
uniformly, regardless of anyone's distance from it. A fire declared with
`speedMultiplier: 0.1` did not do nothing before this ADR — it slowed
**everyone in the building to a tenth of their walking speed**, the moment
the fire started, for as long as it lasted, whether they were standing in it
or three floors away. This is the crude, pre-existing effect every other
hazard kind (`crowdSurge`, `flood`, `powerOutage`, `roadClosure`,
`securityIncident`, `transitDisruption`) still has, unchanged — the earlier
finding was wrong only about `fire`/`smoke`, and this ADR replaces it for
those two kinds specifically. It was found by symptom, not by inspection:
a fire hazard added to an otherwise-normal test scene froze an unrelated
crowd of unexposed people dead at the corridor entrance, and tracing why led
here.

RiMEA has no smoke test to unblock (that was checked and corrected in an
earlier pass — see `docs/CLAIMS_LEDGER.md`'s 2026-09-21 RiMEA-version
correction), so nothing here is scoped to pass a named test. It is scoped to
a real product gap: a fire on a floor plan that had no simulated effect on
anyone's speed, route or survival, only a shape and a caption.

## Decision

**Fire and smoke get a local, time-growing, distance-falling model
(`smokeHazards.ts`), replacing the scene-wide multiplier for those two kinds
only.**

1. **The affected radius grows.** `smokeRadiusAt` grows linearly from 0 to
   the hazard's own `radiusMeters` over a new `growthSeconds` field
   (self-chosen default 120 s — this project has no fire-growth data to fit
   a real curve, linear or the standard "t-squared" shape, to). Before
   `startsAtSeconds` or after `endsAtSeconds`, the radius is 0.
2. **Exposure falls off with distance, linearly to the edge.**
   `localExposure` is the hazard's own `severity` at its centre, 0 at or past
   the current radius. Two overlapping hazards take the worse exposure, not
   the sum (`mostExposingHazard`) — two small fires do not make someone twice
   as unable to see or breathe.
3. **Speed scales locally, off the hazard's own `speedMultiplier`.**
   `exposureSpeedFactor` eases from 1 (clear) to the hazard's own
   `speedMultiplier` (its centre) — the scene author's own number, the same
   field the old scene-wide mechanism read, now applied where the hazard
   actually is rather than everywhere at once.
4. **Steering away is a local push, not a router cost.** The plan for this
   work asked for route-cost weighting; the router's grid
   (`crowdNavigation.ts`) is built once from the scene and is not rebuilt
   every tick a hazard's own radius grows, so re-costing it per tick was not
   attempted. `hazardAvoidancePush` instead adds a repulsion away from the
   hazard's centre into `crowdMovement`'s existing force sum, the same way
   the wall push and the anticipation push already work — scaled by exposure
   and by the hazard's own `visibilityMultiplier` (poor visibility means
   slowing down is what exposure mostly does, not clean navigation around
   it).
5. **A fractional dose accumulates toward incapacitation.** `fedDoseThisTick`
   is self-authored in the _shape_ of fractional-effective-dose reasoning —
   dose accumulates with time and severity, 1.0 is incapacitation — **not a
   reproduction of a specific published toxicity model** (Purser's CO/HCN
   FED formula and its fitted constants, most notably). That formula's exact
   coefficients were not independently verified for this project to cite
   with confidence, and citing them without that verification would be
   exactly the kind of claim this project's own history exists to catch.
   `riskScore` (the scene author's own number, already on the schema) sets
   how many seconds of full exposure it takes to reach a dose of 1
   (`doseSecondsAtFullExposure = 180`, self-chosen).
6. **Incapacitation pins, and is permanent.** Past a dose of 1, a person is
   marked `incapacitated`, their target is pinned to where they stand, they
   are skipped by the decision backend the same way a rider on a stair is,
   and `isExitBound` refuses them — they can never be counted as having left.
   `SimulationSnapshot.incapacitatedCount` reports how many, live.

## Consequences

- **Every other hazard kind keeps the scene-wide mechanism, unchanged.**
  `crowdSurge`, `flood`, `powerOutage`, `roadClosure`, `securityIncident` and
  `transitDisruption` have no localized model of their own; excluding only
  `fire`/`smoke` from `hazardToEnvironmentFactor`'s conversion was the
  narrowest fix that did not touch behaviour this ADR was not scoped to
  change.
- **A disclosed simplification, not a physical claim, on four fronts**: the
  affected area is a circle, not a smoke layer shaped by ceiling height,
  doorways or ventilation; growth is linear, not a fitted fire curve;
  falloff within the radius is linear, not measured; and incapacitation
  stops the walk, not the body — someone who goes down is still a
  standing-sized obstacle a crowd can jostle, not a collapsed one a crowd
  would have to route around. None of this is CFD, and the editor's own
  hazard panel says so next to the fields that matter
  (`hazardSmokeDisclosure`).
- **Dispatch of who gets exposed first is not modelled.** A building's real
  evacuation plan might phase which floors respond to which alarm; this
  project's evacuation logic sends the whole building for the exits at once,
  unchanged by this ADR (a pre-existing limitation, noted again here because
  it interacts with which floor a hazard is declared on).
- **No report surfaces `incapacitatedCount` yet.** It is live on the
  snapshot, the same place `evacuationClearSeconds`/`evacuationExits`
  already sit unconsumed by any panel — a future report or the "实测" panel
  can read it; building that display was not required to make the number
  real, and was left out of this pass's scope.

## What was built (2026-09-22)

- `smokeHazards.ts`: `smokeRadiusAt`, `localExposure`, `mostExposingHazard`,
  `exposureSpeedFactor`, `fedDoseThisTick`, `fedIncapacitationDose`,
  `hazardAvoidancePush` — all pure, all documented with what each self-chosen
  constant is and is not.
- `hazardSchema` gained `growthSeconds` (self-chosen default 120 s,
  fire/smoke only, ignored otherwise).
- `simulationSceneConfig.sceneHazardRuntimes`: filters a scene's hazards to
  `fire`/`smoke` only — every other kind is untouched by this pass, still
  running through the pre-existing scene-wide mechanism.
- `simulationEngine.ts`: `SimulationAgent` gained `smokeSpeedFactor`,
  `hazardAvoidance`, `fedDose`, `incapacitated`; `applyHazardExposure` runs
  once a tick before the movement step; `isExitBound` and
  `mallCrowdDecisionBackend`'s per-agent loop both refuse an incapacitated
  person, mirroring the existing refusal for a rider mid-flight.
  `SimulationSnapshot.incapacitatedCount` is new (optional, matching
  `evacuationClearSeconds`'s own precedent for the many callers that do not
  need one).
- `crowdMovement.ts`: free speed now also scales by `smokeSpeedFactor`;
  `hazardAvoidance` is added into the force sum; `incapacitated` joins the
  existing "holding" states (frozen target, no walk).
- `bioCityWeatherSystem.ts`: `fire`/`smoke` hazards are excluded from
  `hazardToEnvironmentFactor`'s scene-wide conversion — the bug this ADR's
  Context section found and the fix that makes the local model the only
  effect those two kinds have, rather than a second one stacked on top of
  the first.
- Editor: the hazard param panel gained a `growthSeconds` control and the
  (previously present in the mutation type but missing from the panel
  entirely) `visibilityMultiplier` control, plus the disclosure text, shown
  only for `fire`/`smoke`. `EditorHazard`/`sceneEditorConversions.ts`/
  `sceneEditorAdders.ts` round-trip `growthSeconds` both directions.
- Tests: `smokeHazards.test.ts` (20 cases, pure functions, including the
  radius-growth clamp, the falloff shape, `mostExposingHazard` correctly
  preferring worse-not-nearest, and the dose formula's own arithmetic
  against its stated anchor). `simulationSmoke.test.ts` (8 cases) through the
  real scene → engine pipeline: local slowdown observed only inside the
  radius, no slowdown or dose outside it, an incapacitation that genuinely
  requires the dose anchor's own 180 s of full exposure (proved by sealing
  someone in with the fire — an open corridor lets a merely slow person
  bootstrap their own way clear, a real, not-a-bug feature of the model this
  test's own comment explains), an incapacitated person never counted as
  exited, and the avoidance push pointing the right way. A scene with no
  hazard is asserted bit-for-bit unaffected.
