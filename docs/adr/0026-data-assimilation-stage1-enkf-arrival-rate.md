# ADR-0026: Data assimilation stage 1 — a real EnKF that corrects a running scene's arrival rate

Status: accepted. Builds on `realObservations.ts` (gap-closure plan batch
4.2) and ADR-0016/simulationEngine.ts's source/spawn model.

## Context

`realObservations.ts`'s own module doc has said since it was written: "This
is the prerequisite the plan itself names for data assimilation (particle
filter / EnKF): a plain count-by-count comparison... not a filter that
feeds corrections back into the running simulation. That remains future
work." This is item 4 of the ten-item backlog, picked up after ADR-0023
(road network), ADR-0024 (transit ridership), and ADR-0025 (phased
evacuation).

## Decision

### What is assimilated: a demand parameter, not the crowd itself

A textbook EnKF for a full crowd would need an ensemble of complete running
simulations — an independent copy of the whole agent population per
ensemble member, re-stepped every assimilation window and then merged. This
project has no infrastructure to run that and no budget that justifies it:
a single social-force step over roughly a thousand agents costs single-digit
milliseconds (CLAUDE.md's own 2026-09-19 measurement); an ensemble of 30
running the same window in parallel is not free, and this project's own
established discipline (ADR-0023, ADR-0024) is to not build the expensive
thing before there is a real gap only it can fill.

`dataAssimilation.ts` instead assimilates the low-dimensional _cause_ — an
entrance's arrival rate, people/minute — against a real observed flow,
rather than the high-dimensional _effect_ (where several hundred agents
currently stand). This is not a shortcut invented to dodge the hard case:
published pedestrian-simulation data-assimilation work generally takes the
same approach, calibrating demand/OD parameters against sensor counts
rather than filtering individual trajectories, because the trajectories
are downstream of the demand and the demand is what a real count line
actually constrains.

### A real EnKF, not a smoothing average

`enkfUpdate` is the standard stochastic (perturbed-observation) EnKF
update — Evensen 1994, the perturbed-observation variant of Burgers, van
Leeuwen & Evensen 1998: forecast covariance from the ensemble's own spread,
a Kalman gain from that covariance against an assumed observation
variance, and each member updated against its own independently perturbed
copy of the observation (not one shared observation, which would collapse
ensemble spread too fast and understate how much uncertainty survives one
imprecise count). `createEnkfEnsemble` seeds an ensemble around a scene's
own authored arrival rate — the prior, before any real count has corrected
it.

The observation operator is the identity: a count line's measured flow is
read directly as an estimate of the entrance's true arrival rate. This is
a disclosed simplification, not a claim that a count line placed anywhere
downstream measures the entrance exactly — the mapping is closest to true
when a scene author places the count line hard against the entrance, and
this module does nothing to correct for placement elsewhere.

### Real feedback: the corrected rate drives spawning

`simulationEngine.ts` gains `assimilateEntranceArrivalRate(entranceId,
observedRatePerMinute, options?)`: on first call for a given entrance it
seeds an ensemble from that source's current `arrivalRatePerSecond`; every
call runs one `enkfUpdate` against the supplied observation and then
**overwrites `sources[i].arrivalRatePerSecond` with the posterior ensemble
mean** — the same array `spawnArrivals` already reads every tick. This is
the actual "feeds back into the running simulation" the prerequisite
comment asked for: the next arrival is drawn at the corrected rate, not
just reported as different from it. The caller (not this module) decides
when to call it and with what observation — supplying each new minute's
`ObservedLineCount` from `realObservations.ts` as it becomes relevant is
the intended use, but the method itself has no opinion about timing or
where the observation came from.

### What this is still not

- **Not full-state assimilation.** Nothing about where individual agents
  are, how many are in a given shop, or a hazard's own spread is
  corrected — only demand at an entrance. A future stage could widen the
  state vector (e.g. per-shop conversion rate) using the same
  `dataAssimilation.ts` primitives; not attempted here.
- **Not automatic.** The engine does not itself watch a CSV file or decide
  when a new observation is due — a caller (a headless run, a future panel)
  drives the timing, matching how `realObservations.ts` is already an
  offline import rather than a live feed.
- **Not calibrated uncertainty.** The prior spread and the assumed
  observation noise are self-chosen placeholders, not fitted to any real
  sensor's measured error — the same class of disclosed, un-fitted constant
  this project's other engineering placeholders already are.

## Consequences

- `simulationEngine.ts` keeps one `EnkfEnsemble` per entrance id that has
  ever been assimilated, in a `Map` cleared on `reset()` (a fresh run starts
  from the scene's own prior again) and pruned on `replaceGeometry` the
  same way vehicles are already pruned when their road disappears — an
  entrance an edit removes drops its ensemble with it.
- `dataAssimilation.ts`'s functions are pure and take no dependency on the
  engine, so the EnKF math itself is fully unit-testable against known
  statistical results (a converging mean, a shrinking spread) independent
  of any simulation machinery.
