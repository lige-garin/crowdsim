# Social-force calibration against the fundamental diagram (2026-09-14)

Raw numbers and the full search log: `2026-09-14-social-force-fundamental-diagram.json`.
Reproduce:

```bash
cd packages/app
CALIBRATE=1 CALIBRATE_EVALUATIONS=90 npx vitest run src/fundamentalDiagram.calibration.test.ts
```

## What was calibrated, against what

- **Model:** `crowdMovement.ts` (Helbing & Molnár social force plus body contact).
- **Fitted:** relaxation time τ, social strength A, social range B, anisotropy λ.
  Everything else in `socialForceParameters` is hand-picked.
- **Reference:** Weidmann (1993) speed–density curve, as implemented and sourced
  in `pedestrianFundamentalDiagram.ts`.
- **Experiment:** `fundamentalDiagramHarness.ts` — a straight corridor with walls
  on both sides, looped end to end, filled to a fixed density; 8 s to settle, 8 s
  measured; mean walking speed along the corridor. Per-person free speeds
  N(1.34, 0.26) m/s and body radii as in the app.
- **Explicit density slowdown off.** With it on, the Weidmann relation is imposed
  rather than produced, so fitting to it would prove nothing. It was also wrong:
  stacked on the forces it stopped a corridor dead above 2.5 P/m².
- **Search:** bounded Nelder–Mead, 90 evaluations, on densities 0.5, 1.5, 2.5,
  3.5 P/m², seed 1, corridor 20 × 3 m.

## Checks on conditions the fit never saw

Root-mean-square speed error, m/s.

|                                          | Held out: densities 1, 2, 3; seeds 2, 3; 5 m wide | SFPE corridor formula, 1–3.5 P/m² (not fitted) |
| ---------------------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| Previous defaults, with density slowdown | 0.31                                              | 0.34                                           |
| Previous defaults, without               | 0.15                                              | —                                              |
| **Fitted (now the defaults)**            | **0.079**                                         | **0.102**                                      |

Fitted values: τ = 0.644 s, A = 1.966 m/s², B = 0.307 m, λ = 0.287.

## Limits, stated plainly

- **Not identifiable from this curve alone.** A second search from a distant
  start (τ 0.9, A 6, B 0.6, λ 0.7) ended at τ = 0.903 s, A = 4.66 m/s²,
  B = 0.560 m, λ = 0.872 with a lower fit error (0.070) and held-out error
  (0.057), but a worse SFPE error (0.137). The set closer to published social-force
  magnitudes, and better on the independent reference, was kept. Choosing
  between such sets properly needs more observables than one curve: bottleneck
  flow against width, lane formation in counterflow, trajectory data.
- **A published curve, not trajectories.** No measured pedestrian trajectories
  were used. The residual error is largest near jam density (4 P/m²: 0.01 m/s
  measured against 0.16 m/s), where the model jams slightly early.
- **SFPE constants** (k = 1.40 m/s, a = 0.266) are the hydraulic-model values as
  commonly reproduced; verify against the handbook edition before citing.
- Benchmarks in `benchmarkScenarios.ts` all still pass with the fitted values and
  no change to their ranges.
