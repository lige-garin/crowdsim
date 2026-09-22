# Social-force calibration against real trajectory data (2026-09-22)

Raw numbers and the full search log:
`2026-09-22-trajectory-calibration-run.json`. Reproduce:

```bash
cd packages/app
CALIBRATE=1 CALIBRATE_EVALUATIONS=300 npx vitest run src/trajectoryCalibration.calibration.test.ts
```

## Why this exists

The 2026-09-14 fundamental-diagram calibration's own "Limits" section said
plainly: "A published curve, not trajectories. No measured pedestrian
trajectories were used," and named trajectory data as one of the
observables that would be needed to properly choose between parameter sets
that fit the density curve equally well. This is that data, and this
calibration.

## What was calibrated, against what

- **Model**: the same four parameters as the 2026-09-14 fit — relaxation
  time τ, social strength A, social range B, anisotropy λ — using the exact
  same repulsion formula from `crowdMovement.ts` (`predictedAcceleration`
  in `trajectoryCalibration.ts` is a direct port of it), excluding walls
  (none in this data), anticipation and sidestep (neither is one of the
  four fitted parameters in the 2026-09-14 fit either, so leaving them out
  keeps the two calibrations on the same footing).
- **Data**: the ETH pedestrian dataset (Pellegrini et al., ICCV 2009), one
  scene, 4,772 usable (pedestrian, frame) samples after requiring a real
  velocity both just before and just after. See
  `docs/calibration/data/README.md` for provenance, format and the licence
  caveat.
- **Method**: one-step acceleration matching, not a simulated rollout. At
  each usable moment, the formula predicts an acceleration from the real
  position, real velocity, and the real neighbours' real positions at that
  same frame — it never simulates forward, so nothing here can drift from
  the data the way a rollout-based fit could.
- **Search**: the same bounded Nelder–Mead solver the 2026-09-14 fit uses
  (`boundedNelderMead.ts`, extracted from `fundamentalDiagramFit.ts` this
  session so both calibrations share one solver), 304 evaluations, same
  parameter bounds.

## Result: real tension between the two calibration targets, not agreement

|                                   | τ (s) | A (m/s²)  | B (m) | λ         |
| --------------------------------- | ----- | --------- | ----- | --------- |
| Fundamental-diagram fit (current) | 0.644 | 1.966     | 0.307 | 0.287     |
| **Trajectory fit**                | 0.931 | **0.300** | 0.684 | **0.050** |

**A and λ both converge to the edge of their own search bounds** (A's lower
bound is 0.3, λ's is 0.05) — not an interior optimum. That is a sign the
acceleration-matching cost is not meaningfully constraining those two
parameters in this data, not a sign the true value is at the boundary;
widening the bounds would very plausibly just push them further.

Trajectory-prediction RMSE barely moves with all this parameter change:
hand-picked 8.369 m/s², the 2026-09-14 fit 8.349, the new trajectory fit
8.242 — about a 1.5% reduction for a search that moved A by 6.5x and λ by
5.7x. **The cost surface this data produces is close to flat along those
two directions.**

**The trajectory-fitted parameters make the density-curve fit distinctly
worse**: 0.203 m/s RMSE against Weidmann, versus 0.104 for the existing
2026-09-14 fit and 0.162 for the pre-2026-09-14 hand-picked values — worse
than even the hand-picked baseline the 2026-09-14 work replaced. Pushing A
and λ down to chase a small trajectory-RMSE gain moves the model
substantially further from the published density curve.

## What this means, and what it does not

This does **not** resolve the fundamental-diagram report's own "not
identifiable from this curve alone" finding by picking a winner. It makes
the same underlying problem concrete with real data instead of a second
synthetic search: **the two observables (a density-speed curve fit from a
dense, flowing corridor; single-step accelerations from a comparatively
open outdoor scene) pull the social-force parameters in different
directions**, and a parameter set that satisfies one noticeably worsens the
other. That is a real property of this model and these two datasets, not a
bug in either calibration.

**A plausible reading, stated as a reading, not a proven cause**: ETH is an
open outdoor scene, not a bottleneck or dense corridor — most observed
accelerations are modest, ordinary walking, not crowd-jam avoidance. A
social-strength constant fitted to reproduce Weidmann's curve (which is
about dense, flowing conditions) may simply be stronger than everyday open-
space walking calls for, and the trajectory fit's pull toward a weaker A is
the optimizer noticing that mismatch — not necessarily evidence the
density-curve-fitted A is wrong for the conditions it was actually fitted
to.

**No change to `socialForceParameters`.** The trajectory-fitted values are
not adopted as defaults: two of the four sit at a search-bound edge rather
than a real optimum, and the set as a whole measurably worsens the fit this
project actually calibrates its benchmarks against. This report exists to
record the finding and the tension, not to ship a new parameter set.

## Limits, stated plainly

- **One scene**, not the full ETH/UCY corpus (`docs/calibration/data/README.md`
  lists the other available scenes from the same source).
- **No wall data** for this scene — the fit only ever exercises the
  agent-agent repulsion term, never the wall term.
- **A single representative body radius** (0.23 m each side), since the
  dataset has no body-size measurements.
- **Desired velocity is each person's own whole-track net displacement
  divided by duration** — a standard simplification in this kind of fit,
  not a measured goal. A person who paused, turned around, or changed
  their mind mid-track gets a "desired velocity" that is at best an
  average of behaviour that was not actually constant.
- **Anticipation and sidestep are excluded** from the predicted-acceleration
  formula (see "What was calibrated" above) — real accelerations in the
  data include whatever those forces would have contributed in this
  project's own live model, so the residual this fit reports is partly
  "what a four-parameter model without anticipation/sidestep cannot
  explain," not purely a defect in the four fitted numbers.
