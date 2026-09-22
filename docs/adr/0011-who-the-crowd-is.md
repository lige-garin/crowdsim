# ADR 0011: Who the crowd is made of

- Status: **Accepted and implemented** (2026-09-21)
- Touches: scene schema, engine spawning, connector travel, validation report
- Related: ADR-0010 (floors and connectors), ADR-0009 (demand profiles, groups)

## Context

Everyone in a run walked at the same speed distribution: N(1.34, 0.26), fitted
to Weidmann's free-flow figure. One number for a shopping centre, a station and
a care home alike.

Meanwhile `pedestrianPresets.ts` already held a published population — IMO
MSC.1/Circ.1533, Annex 3, Tables 3.1/3.4/3.5: twelve groups by sex and age,
each with a walking speed range on the flat, up stairs and down, and the share
of a ship's passengers each one is. **It was wired to the validation report
only.** The report printed the table; the simulation ignored it.

So the product could show a page about mobility-impaired passengers and, in the
same run, walk all of them at 1.34 m/s. The questions this locks out are the
ones the feature exists for: how much longer a crowd with 20% mobility-impaired
people takes to clear, where the slow walkers pile up on a stair.

## Decision

**A scene may declare who its crowd is; a scene that does not keeps today's
behaviour exactly.**

1. **`scene.population`, and `entrance.population` to override it per door** —
   a mix of `{ profileId, share }`. The shares must add to 1 and no profile may
   be named twice; the schema rejects a mix that does not, because a mix that
   does not add up leaves the rest of the crowd undefined and every reader would
   invent a different answer.
2. **The profile ids are resolved in the app, not the schema.** The speeds
   behind them come from a published table and belong beside the code that
   cites it. A scene naming a profile this build does not know is reported as
   unknown — nobody is quietly given a profile they did not ask for.
3. **A drawn person's speed enters through the factor the engine already has.**
   `speedFactor` stays "relative to the scene's mean", so the social force, the
   groups and the fundamental diagram never learn that populations exist.
4. **Stairs are timed per person.** A connector now carries its length, and
   whoever crosses it is held for `length / their own stair speed`, up or down
   as the case may be. Anyone without a profile keeps the connector's default.
5. **Groups take the speed of the slowest member actually drawn**, which is the
   rule ADR-0009 already used, now applied to drawn speeds.

## What this does not claim

- **The distribution inside each range is ours, not the source's.** IMO gives a
  minimum and a maximum per group and no shape between them. Uniform is chosen
  because it adds no structure the source does not have. It is written down in
  `populationSampling.ts` and printed in the validation report.
- **The label carries nothing but speed.** A person drawn from "females over 50,
  mobility impaired" walks at those speeds. No behaviour, patience, route
  choice or group habit follows from the label, and none of it is calibrated
  against this project's own scenes.
- **The IMO population describes ship passengers**: 40% mobility impaired, no
  children. Borrowing it for a shopping street is the scene author's decision,
  and the report says which population a run used so the decision is visible.
  `crowdDemographics.ts` already warns about this for the figures on screen.

## A correction to the plan this came from

The gap-closure plan said wheelchair users must not be routed to stairs.
**The data does not support that rule, so it was not built.** IMO's table gives
the mobility-impaired groups **non-zero stair speeds** — they climb, slowly —
and it does not separate wheelchair users from people with a stick or a slow
gait. Building a "cannot use stairs" flag on top of this table would have been
inventing a category the source does not have.

Wheelchair users as a distinct group need their own speed data and a ramp/lift
model. That belongs with the lift work (ADR-0010's excluded item), not here.

## Consequences

- Scenes written before this are byte-for-byte unchanged, and a test pins that:
  with no population declared, no agent carries a profile and the speed
  distribution is what it was.
- The calibration in `docs/calibration/` was fitted against the single default
  distribution. **It does not carry to a scene with a declared population**, and
  no fundamental-diagram claim should be read off such a run until it is
  re-fitted.
- The validation report now prints the population the run used, or says plainly
  that the scene declared none and the table below is reference material.
