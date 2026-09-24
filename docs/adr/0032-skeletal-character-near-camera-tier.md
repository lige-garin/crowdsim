# ADR-0032: A bounded, near-camera tier of real skinned characters

Status: accepted. Builds on `crowdFigures.ts` (the procedural instanced
crowd, unchanged except for one additive option), `sceneModelAssets.ts`
(the existing y-up → z-up correction precedent), and the Quaternius CC0
character/animation assets approved by the user for download.

## Context

Item 9 of the ten-item backlog: skeletal-animated pedestrian characters.
CLAUDE.md has recorded "骨骼动画人物未做（需下载第三方资源）" since
2026-09-14. Downloading a third-party asset requires explicit user
permission with the source, filename, and size disclosed first (this
session's standing rule) — the user was asked, chose "search yourself and
come back for approval," and approved Quaternius's CC0 **Universal Base
Characters** + **Universal Animation Library** (quaternius.itch.io) out of
three researched candidates. Both packs were downloaded, and one body
(`Superhero_Male_FullBody`, the one free body type shipped in glTF in the
Standard tier) plus two animation clips (`Walk_Loop`, `Idle_Loop`, from the
120+-clip animation library) were copied into
`packages/app/public/assets/characters/quaternius/`.

The real constraint this ADR is about: `crowdFigures.ts` renders up to
2,000 pedestrians as a handful of `InstancedMesh` draw calls (20 meshes
total) specifically because per-instance bone poses cannot be expressed
through `InstancedMesh` — every instance shares one geometry and gets only
a 4×4 transform, not an independent skeleton. A real skinned, animated
character is therefore necessarily one draw call plus one
`AnimationMixer.update()` per person; there is no way to batch it the way
the procedural figures are batched. Rendering the full 2,000-person crowd
this way was never attempted and is not what "wire in the downloaded
assets" needs to mean.

## Decision

### A small, bounded, always-on near-camera tier, not a crowd-wide swap

`skeletalCharacters.ts`'s `createSkeletalCharacters()` builds a fixed pool
of 12 (`DEFAULT_SKELETAL_CHARACTER_CAPACITY`) skinned character clones
(`SkeletonUtils.clone`, sharing one loaded geometry/material set) and, each
frame, assigns them to the up-to-12 agents nearest the camera within 20 m
(`DEFAULT_SKELETAL_NEAR_DISTANCE_METERS`) — computed by
`selectNearestSkeletalAgents`, a pure, three.js-free function directly unit
tested. Nobody else — the overwhelming majority of any real crowd — is
touched by this module at all; they continue to be drawn exactly as before
by `crowdFigures.ts`. Because the cost is capped regardless of crowd size
(always ≤ 12 extra draw calls and mixer updates, never proportional to
`crowdBudget.maxAgents`), this tier can stay unconditionally on with no
user-facing toggle — the project's own precedent (`RealtimeStrip`'s removed
`windowSeconds` prop, `DEFAULT_SKELETAL_CHARACTER_CAPACITY` no longer
accepted as a parameter after a self-applied ponytail-review pass, both
2026-09-24) is to not add configurability nothing exercises.

### `crowdFigures.ts` gains one additive option, `hidden`, nothing else changes

The two layers would otherwise draw the same person twice — the low-poly
capsule figure and the real skinned character both trying to occupy the
same spot. `crowdFigures.ts`'s `update()` gains an optional
`hidden?: ReadonlySet<number>` in its options object; an agent whose id is
in that set is skipped in the same way an agent past the archetype's
instance capacity already is (`if (index >= capacity) continue`, now
joined by `if (options.hidden?.has(agent.id)) continue`). Every existing
caller that never passes `hidden` is unaffected — covered by an explicit
regression test. `useSimulationViewportRenderer.ts` computes the hidden set
from `skeletalCharacters.update()` and passes it straight into
`figures.update()`'s call that same frame.

### Walk vs. idle, not one clip forced onto everyone

Each slot holds two `AnimationAction`s (`Walk_Loop`, `Idle_Loop`) on one
`AnimationMixer`; whichever a newly assigned agent needs plays immediately
(no cross-fade — two different people have nothing to blend from), and a
still-assigned agent that starts or stops moving cross-fades between them
over 0.2 s. `Walk_Loop`'s `timeScale` is clamped-scaled by the agent's own
speed against the Weidmann free-flow speed
(`skeletalGaitTimeScale`, `pedestrianFundamentalDiagram.ts`'s existing
constant, not a new one) so a fast walker's legs visibly move faster than
a slow one's — clamped `[0.15, 2.5]` so a near-stopped agent doesn't freeze
mid-stride and a fast one doesn't flail; both bounds are engineering
placeholders, this project has no real gait-frequency data to calibrate
against.

### The Y-up → Z-up correction, found by real-browser verification, not assumed

The downloaded character is authored Y-up, glTF's own convention; this
scene is Z-up throughout (`agentWorldPosition` draws every agent at
`z = 0.9`, ground is `z = 0`). The first wiring attempt skipped this
correction and, verified in a real browser via a temporary debug hook (see
Verification below), produced a character whose bounding box came out
~0.76 m "tall" and ~1.78 m along a horizontal axis — lying on its side, not
standing. Fixed the same way `sceneModelAssets.ts` already corrects
`upAxis: "y-up"` visual assets: the loaded model gets `rotation.x = π/2`,
applied to an inner object so the outer `root`'s own z-rotation (heading)
still turns the character around the scene's actual vertical axis.

## What this is not

- **Not a full-crowd upgrade.** The other ~1,988 people in a full crowd are
  still the procedural figures; this tier only ever covers whoever is
  within 20 m of the camera, capped at 12.
- **Not visually diverse.** One body, one skin, one set of two clips —
  every near-camera character currently looks like the same person.
  Outfit/body variety (the pack ships hairstyles, and a second free body,
  `Superhero_Female_FullBody`, unused here) is real future work, not
  attempted in this pass.
- **Not clickable.** `crowdFigures.ts`'s own `pick()` raycasts only its
  registered `InstancedMesh`es; a skeletal character sitting where an
  agent would otherwise be does not register a hit. A known gap, not a
  silently accepted one.
- **Not a calibrated gait model.** The speed-to-`timeScale` mapping and its
  clamp bounds are engineering placeholders.
- **Not continuous asset streaming or LOD blending.** Loading is one-shot
  at viewport construction (async, best-effort — a failed fetch or a
  missing clip leaves the module permanently inert, and the crowd renders
  exactly as it did before this module existed); there is no fade between
  a character popping into/out of the near-camera tier as agents cross the
  20 m boundary or the nearest-12 ranking changes.

## Verification

Real-browser, not just unit tests, because the failure mode that actually
occurred (wrong up-axis) is invisible to jsdom and to the pure-function
tests. A temporary, clearly-marked debug hook
(`window.__skeletalDebug`, removed before commit — the same
throwaway-harness pattern ADR-0015's real-GPU parity check used) exposed
the live `camera`, `rig`, `figures`, `skeletalCharacters`, and per-frame
agent list from inside the running renderer effect, driven from the
browser tool rather than mouse-drag trial and error (camera zoom/pan by
mouse proved too imprecise to reliably land within 20 m of a moving
crowd). With the camera's target and radius set directly to a known
agent's position and 12 m (the interactive zoom-in minimum,
`orbitCamera.ts`'s `RADIUS_MIN`):

- All 12 pool slots loaded and populated (`walkClip`/`idleClip` both
  found), confirmed via the real asset network requests (`200 OK` on
  every `.gltf`/`.glb`/`.bin`/`.png`) and zero console warnings from
  `AnimationMixer`'s own property-binding diagnostics.
- Before the up-axis fix: bounding box ~0.76 m tall, ~1.78 m along a
  horizontal axis. After: ~1.81 m tall (correct for the "Superhero" body
  type), narrow horizontal footprint.
- `hidden` wiring: with a controlled `Set` of 2 ids passed to
  `crowdFigures.ts`'s `update()`, the instanced body count dropped from 10
  to 8 (decisively confirmed — temporarily removing the `continue` made
  the count stay at 10, the new test failed as expected, then passed again
  once restored); with no `hidden` argument at all, behavior is unchanged
  from before this option existed (explicit regression test).
- A real screenshot, after the fix, showing several visibly detailed,
  muscled, textured characters mid-stride standing among the flat-colored
  low-poly crowd — not a placeholder, not a description of intended
  behavior.
- `pnpm typecheck`, `pnpm lint`, `npx prettier . --check`,
  `pnpm test` (full suite), `cargo test`, and `pnpm e2e` (12/12, including
  the pre-existing 3D-build-and-undo case, confirming no regression) all
  pass after the debug hook was fully removed.
