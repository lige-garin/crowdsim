# ADR-0031: Drag-to-draw count lines directly in the 3D/real-time view

Status: accepted. Builds on `worldPlacement.ts`/`placementGhost.ts` (the
existing single-click 3D placement pipeline), `sceneEditorAdders.ts`'s
`addCountLineBetween` (already built for the 2D editor's own drag tool,
2026-09-20), and `cityCameraControls.ts`.

## Context

CLAUDE.md has recorded this exact gap since count lines got a real drag
tool in the 2D editor: "3D 视图里的单击仍落旧的固定线段，因为单击只能表达
这么多" — a click in the 3D/real-time view still drops the old fixed 8 m
east-west segment (`sceneEditorAdders.ts`'s `addCountLine`), because every
3D placement tool is single-click-only (`worldPlacement.ts`'s
`placesInWorld`/`placeInScene`, one screen point in, one entity out). This
is item 10 of the ten-item backlog, picked up after ADR-0023 through
ADR-0030.

The two-point constructor this needs, `addCountLineBetween`, already
exists — the 2D editor's own drag tool has used it since 2026-09-20. What
is missing is a way for the 3D view's pointer handling to produce a second
point at all: `attachCityCameraControls`'s left-button drag already means
"pan the city," and `onClick` only fires for a near-stationary press
(`isClick`). A count-line drag needs to claim that same gesture for a
different purpose while a drawing tool is selected, without breaking
camera panning for every other tool.

## Decision

### The camera controls yield the drag to an active tool, not the other way around

`attachCityCameraControls` gains an optional `tool` hook —
`{ isActive(), onDown(clientX, clientY), onMove(clientX, clientY),
onUp(clientX, clientY) }`. On a left-button `pointerdown`, if
`tool.isActive()` is true (the count-line tool is selected), the controls
call `tool.onDown` and then skip their own pan/click logic for the rest of
that pointer's lifetime — `pointermove` calls `tool.onMove` instead of
`panByDrag`, and `pointerup` calls `tool.onUp` instead of dispatching
`onClick`. Every other tool (and no tool at all) is completely unaffected:
`tool.isActive()` returns false, and the existing pan/click path runs
exactly as before — camera panning while placing a shop, a road, or
anything else keeps working unchanged. This is the same "ask the more
specific handler first, fall through to the general one" shape as
`attachPlacementGhost.handleClick`'s own `!placement?.handleClick(...) &&
pickAgentAt(...)` line already uses for clicks.

### A rubber-band preview, the same interaction the 2D editor already has

A new draft-line object in the 3D scene (a `Line` between the down-point
and the live cursor point, both from `worldPlacement.ts`'s existing
`scenePointAtScreen` ground-projection) previews the count line while
dragging, mirroring `SceneEditorLines.tsx`'s `<polyline class="draft">`
in the 2D editor. On pointer-up, a drag shorter than 1 m (the same
threshold `SceneEditor.tsx` already uses) is treated as a plain click and
falls back to the existing fixed-segment `addCountLine`, "so the tool
never leaves someone with nothing" — the exact phrase the 2D editor's own
code comment already uses for the identical fallback; a real drag commits
via `addCountLineBetween` instead, going through the same
`createEditorDocumentFromScene`/`createSceneFromEditorDocument` round trip
`placeInScene` already uses for every other 3D placement, so it swaps into
the running simulation exactly the same way (ADR-0007).

### What this is still not

- **Not a general two-point tool framework.** Only the count-line tool
  gets a drag gesture; every other 3D tool remains single-click, since
  none of them currently need a second point. Generalizing the `tool` hook
  beyond count lines is left for whenever a second tool actually needs it.
- **Not endpoint editing after placement.** The 2D editor lets a selected
  count line's endpoints be dragged individually after the fact
  (`SceneEditorLines.tsx`'s handle circles). The 3D view still has no
  entity-selection/handle-dragging model at all for any placed object —
  extending one to 3D is a materially larger feature this pass does not
  attempt.
- **Not different snapping from every other 3D placement.** Both
  endpoints snap to the same `PLACEMENT_GRID_METERS` grid every other 3D
  tool already snaps to — no special snapping (to walls, to existing
  lines) was added.

## Consequences

- `cityCameraControls.test.ts`/its own test file needs a case proving the
  tool hook actually suppresses panning while active and restores it once
  the tool is deselected or the drag ends — a real regression risk, since
  panning is this control's single most-used gesture.
- `useWorldBuilding.ts` gains a `placeLine(start, end)` sibling to its
  existing single-point `place(tool, point)`, going through the same
  undo-history stack, so a drawn count line undoes with Ctrl+Z exactly
  like any other 3D placement.
