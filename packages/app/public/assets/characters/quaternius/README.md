# Quaternius character assets

Used by `packages/app/src/renderer/skeletalCharacters.ts` (ADR-0032): a
small, bounded, near-camera tier of real skinned, animated pedestrian
characters, on top of (not instead of) the procedural crowd in
`crowdFigures.ts`.

## Source and license

- **Universal Base Characters** and **Universal Animation Library**, by
  Quaternius (<https://quaternius.itch.io/universal-base-characters>,
  <https://quaternius.itch.io/universal-animation-library>).
- License: **CC0 1.0 Universal** (public domain dedication) — no
  attribution required, free for commercial use. See the pack pages above
  for the license statement in the author's own words.
- Downloaded with the user's explicit approval (this project's standing
  rule for downloading any third-party file), 2026-09-24, after comparing
  three candidate sources.

## What's actually here

Only a small slice of both packs — everything else in the downloaded
`.zip`s was discarded, not committed:

- `Superhero_Male_FullBody.gltf` + `.bin` + its textures — the one body
  (of six in the full pack) that shipped in glTF format in the free
  Standard tier. The pack's other five bodies (Regular/Teen proportions,
  male and female) and the second free-tier body
  (`Superhero_Female_FullBody`) are not used here — see ADR-0032's "not
  visually diverse" note.
- `walk-animations.glb` — the **entire** 43-clip Universal Animation
  Library Standard file (`UAL1_Standard.glb`, renamed), kept whole rather
  than extracted down to the two clips actually used
  (`Walk_Loop`, `Idle_Loop`) because extracting a single clip out of a glTF
  animation buffer means rewriting accessors/buffer views by hand, and the
  15 MB cost of keeping the rest is small enough not to be worth that
  risk. Nothing currently loads the other 41 clips.

## A pack bug fixed on the way in, not upstream

The character `.gltf` references two normal-map textures as
`T_Hair_1_Normal_png.png` and `T_Eye_Normal_png.png` — filenames the actual
downloaded pack does not contain (it has `T_Hair_1_Normal.png` and
`T_Eye_Normal.png`, without the `_png` suffix). The two files here are
copies of those textures under the names the `.gltf` actually asks for;
this is a naming mismatch in the upstream pack itself, worked around
locally, not a modification to the art.
