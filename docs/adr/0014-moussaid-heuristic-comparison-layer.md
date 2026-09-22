# ADR 0014: Moussaïd's visual heuristic as a second comparison layer

- Status: **Accepted and implemented** (2026-09-22)
- Touches: a new standalone module and its own benchmark harness; nothing in
  the live simulation engine, scene schema or editor
- Related: ADR-0013 (ORCA — the same "comparison layer, not a movement
  backend" shape, same benchmarks, same non-goals)

## Context

Gap-closure plan batch 3.2 asks for a second alternative to social force:
Moussaïd, Helbing & Theraulaz, "How simple rules determine pedestrian
behavior and crowd disasters", PNAS 108(17), 2011. Unlike ORCA (a
velocity-obstacle / linear-programming model), this one is a **direction-
choice** heuristic: at each step a pedestrian samples candidate walking
directions within their own field of view, measures how far they could
walk unobstructed in each one (a "visible distance" ray cast against
neighbours and walls), and picks the direction that minimises an implied
detour distance to the goal — go a bit off-course into open space rather
than stall behind someone directly ahead. The paper's own claim is that
this reproduces lane formation, oscillations at bottlenecks and the
"faster-is-slower" crowd-disaster effect from three simple rules, without
an explicit force between every pair of agents.

Same reasoning as ADR-0013 for scope: this is a comparison, not a second
production model, and it is self-implemented rather than pulling in any
existing library (there is no standard "Moussaïd model" package the way
RVO2 exists for ORCA; the paper's own algorithm is what there is to
implement).

## Decision

**`moussaidHeuristic.ts` implements the paper's direction-choice rule as a
standalone stepping function with its own entry in the same benchmark
harness ORCA already uses (`orcaComparison.ts`, extended, not forked).
Not wired into `simulationEngine.ts`, the scene schema, the editor, or any
runtime toggle.**

1. **Visible distance, by ray casting.** For a candidate direction, the
   distance a person could walk before their own body would first touch
   another agent's or a wall — capped at a maximum sighted distance
   (`maxSightMeters`, self-chosen at 10 m; the paper does not give a
   specific number, only that it is "far enough to see the relevant
   part of the scene"). This is exact ray-vs-circle and ray-vs-segment
   geometry, not a grid or a sample-and-hope search.
2. **Direction choice by the paper's own distance function.** Among
   directions swept across the walker's own field of view
   (`fieldOfViewDegrees`, self-chosen at 170°, the paper's own reported
   range for a comfortable human FOV) at a fixed angular step
   (`angleStepDegrees`), the chosen direction minimises
   `f(alpha) = sqrt(d_goal^2 + d(alpha)^2 - 2 * d_goal * d(alpha) * cos(alpha - alpha_goal))`
   — the law-of-cosines distance of "walk `d(alpha)` this way, then walk
   straight to the goal from there" — the paper's own equation 1. A
   direction with a short visible distance but well-aligned with the goal
   can lose to one that sees further but strays more, exactly the
   trade-off the paper describes qualitatively.
3. **Speed adapts to the chosen direction's own headroom.** Desired speed
   is the walker's own free speed when the visible distance in the chosen
   direction clears a comfortable margin, and eases down as that margin
   shrinks (`speedFromVisibility`) — the paper's own second rule
   ("adapt the speed to the available space"), not a separate borrowed
   mechanism.
4. **Walls stop people the same way as ORCA's comparison does.** Not
   through the heuristic's own visible-distance rule failing to find an
   opening (which it can and does, correctly, steering around a wall it
   can see) — `constrainMovement` is still the hard backstop for the
   final integrated position, for the same reason ADR-0013 gives: a
   single hard clip in one place, not two different soft mechanisms that
   both have to be right.
5. **Same three benchmarks, same harness.** `orcaComparison.ts` gained a
   `moussaid` column alongside `socialForce` and `orca` in
   `runOrcaComparison`'s own result shape, calling `stepCrowdMoussaid`
   through the exact same `runPeriodicCorridor`/`measureBottleneckFlow`/
   `measurePassingDistance` functions ORCA's own comparison already uses —
   not a third forked harness.

## Consequences

- A third, independently useful and testable implementation of a real
  published algorithm exists, comparable against both social force and
  ORCA on the same numbers, without touching the live crowd model.
- The FOV, angular resolution and sight-distance constants are this
  project's own reasonable readings of the paper, not values the paper
  states as exact — disclosed in the module's own doc comment, the same
  way ORCA's own untuned parameters are disclosed in ADR-0013.
- Ray-vs-circle/segment visibility, swept across every candidate angle for
  every neighbour, is more per-step arithmetic than either social force or
  ORCA's neighbour loop. Acceptable for a benchmark harness that runs a
  few hundred agents for a handful of simulated seconds; this ADR makes no
  claim about its cost at production scale, because it is never run at
  production scale.
- As with ORCA, a future "actually selectable" movement backend is a
  separate, larger change this ADR does not authorise.
- **A real gap found building the bottleneck benchmark, fixed before this
  ADR's own numbers were recorded**: the direction-choice rule picks each
  person's heading from a snapshot taken before anyone moves that step.
  With 150 people converging on a 2.4 m gap, that let enough of them choose
  overlapping paths in the same step that, left uncorrected, bodies passed
  through each other — measured directly at up to 0.5 m of interpenetration
  and a specific-flow reading nearly three times Weidmann's own empirical
  peak. Unlike social force (a contact push) or ORCA (a linear program that
  makes overlap structurally impossible), this heuristic has no such
  mechanism of its own, so `separateOverlaps` — a small discrete-time
  penetration correction, three passes over every pair each step — stands
  in for the continuous non-overlap the paper's own model assumes. It
  reduces the worst case to about 0.04 m, not zero, and the module's own
  doc comment says so rather than claiming an exact fix.

## Testing

`moussaidHeuristic.test.ts`: `visibleDistance` against known geometry (a
clear line reports the sight cap; a circle or wall segment placed in the
path reports the correct clipped distance; something behind the walker or
off to the side does not shorten a forward-looking ray). The direction
choice: with an unobstructed field of view, the chosen direction points
exactly at the goal; with an obstacle placed directly ahead, the chosen
direction deviates from the straight line to the goal rather than walking
into it. `stepCrowdMoussaid`: a lone walker reaches and exits at its
target; a wall is never crossed. `orcaComparison.test.ts` gained the
`moussaid` column to its existing shape assertions.
