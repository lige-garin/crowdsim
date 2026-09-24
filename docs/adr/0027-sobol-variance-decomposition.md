# ADR-0027: Sobol variance decomposition, alongside Morris screening

Status: accepted. Builds on `sensitivityAnalysis.ts` (Morris screening,
2026-09-22).

## Context

`sensitivityAnalysis.ts`'s own module doc has said since it was written:
"It does not decompose _how much_ of the output's variance each parameter
explains — that is Sobol indices, a different and much more expensive
method, not built here." This is item 5 of the ten-item backlog, picked up
after ADR-0023 through ADR-0026.

Morris screening answers "which parameters move the result, roughly how
much, and does the effect look linear" cheaply. It does not answer "what
fraction of the output's total variance does this one parameter, alone,
account for" or "how much variance involves this parameter interacting
with others" — that is what Sobol indices are for, and what this ADR adds.

## Decision

### The real Saltelli (2002) sampling scheme, not an approximation of it

`sobolAnalysis.ts` generates two independent sample matrices A and B (each
`sampleCount` rows, one uniform draw per parameter per row), and, for each
parameter `i`, a matrix `AB[i]` that is A with column `i` replaced by B's
own column `i` — the standard Saltelli design. The model is evaluated on
every row of A, B, and every `AB[i]`: `sampleCount * (parameters.length +
2)` evaluations total, a real and substantially larger cost than Morris's
`trajectoryCount * (parameters.length + 1)` — Sobol decomposing variance
needs to see the _joint_ effect of resampling one parameter while holding
the rest at both a "held at A" and "held at B" configuration, which a
one-at-a-time screening trajectory never constructs.

First-order and total-order indices use the estimators in general use for
this design (Saltelli et al. 2010's improved formula for first order;
Jansen 1999's estimator for total order, preferred for its numerical
stability over the original squared-difference form):

- `S_i = mean(f(B) * (f(AB_i) - f(A))) / Var(Y)` — the share of variance
  explained by parameter `i` alone.
- `S_Ti = mean((f(A) - f(AB_i))^2) / (2 * Var(Y))` — the share of variance
  involving parameter `i` at all, including its interactions with every
  other parameter. `S_Ti - S_i > 0` is itself the signal that parameter
  `i` interacts with something else, not just acts alone.

`Var(Y)` is estimated from the combined A and B outputs (`2 *
sampleCount` values), the standard choice for this design.

### A disclosed, real cost trade: a small `sampleCount` by default

Sobol indices converge slowly — real practice runs thousands of samples
per parameter for a trustworthy estimate. This project's evaluations are
real simulation runs (`runBenchmarkScenario`), not a cheap analytic
function, so `defaultSampleCount = 64` is chosen for tractability, not
statistical adequacy: with 6 screened parameters that is `64 * 8 = 512`
evaluations, already an order of magnitude past Morris's default (`10 *
7 = 70`). The indices this produces are a real, unbiased-estimator
computation of the _sample_ Sobol indices — not a claim that 64 samples
gives a converged, low-variance estimate of the _true_ indices. A caller
who wants a tighter estimate raises `sampleCount` and pays for it in
evaluations; nothing here hides that trade or pretends 64 is enough on its
own authority.

### The same worker-experiment shape Morris already uses, for the same reason

`buildSobolExperiment`/`summarizeSobolExperimentResults` mirror
`buildMorrisExperiment`/`summarizeMorrisExperimentResults` exactly: every
evaluation is a real benchmark run, so this runs in the background worker
`ExperimentSweepPanel` already uses rather than blocking the main thread
— the same reason Morris moved off the main thread in the first place.

### What this is still not

- **Not wired into a UI panel.** `SensitivityPanel.tsx` shows Morris
  results; adding a Sobol section is real, additional UI work (a table or
  bar chart of `S_i`/`S_Ti` per parameter) deliberately left for a later
  pass rather than folded into this one, the same "math and worker wiring
  first, a panel is a separable next step" split ADR-0016 (vehicles) and
  ADR-0020 (their UI wiring) already took two stages to do.
- **Not a replacement for Morris.** The two answer different questions
  at very different cost; `sensitivityAnalysis.ts`'s Morris screening is
  unchanged and still the cheap first pass a caller should run before
  deciding whether the more expensive Sobol decomposition is worth its
  evaluation budget.
- **Not calibrated sample adequacy.** `defaultSampleCount = 64` is an
  engineering placeholder chosen for this project's own evaluation cost,
  not a number derived from a convergence study.

## Consequences

- `sobolAnalysis.ts` is a standalone module with no dependency on
  `sensitivityAnalysis.ts` beyond sharing the `SensitivityParameter` shape
  (re-exported, not duplicated) — the two methods' sampling designs share
  nothing else structurally.
- Applying this to the social-force parameters
  (`defaultSocialForceScreeningParameters`, already defined in
  `sensitivityAnalysis.ts`) reuses that existing parameter set rather than
  defining a second one, so the two methods are directly comparable on the
  same six parameters and the same ±50% screened range.
