# ADR 0009: Arrivals that change over time, and people who arrive together

- Status: Accepted (2026-09-15)
- Touches: scene schema (`entranceSchema`), editor round-trip, scene → engine
  config, engine arrivals and decisions, movement model, benchmarks

## Context

Two ways the simulated crowd differed from a real one, both basic in commercial
pedestrian tools.

1. **Demand was constant.** An entrance had one arrival rate for the whole run.
   Real footfall has a shape: a lunchtime peak, a train emptying every few
   minutes. Pedestrian tools take an entry schedule per entrance: a count or
   rate for each time slot.
2. **Everyone walked alone.** On a busy commercial walkway 70% of people walk
   with others (Moussaïd et al. 2010). Groups walk slower, side by side, go to
   the same shops and leave together. A crowd of singles gets flows, speeds and
   dwell patterns wrong in exactly the places a retail study looks at.

## Decision

1. **`entrance.arrivalProfile?: { intervalMinutes = 15, ratesPerMinute: number[] }`.**
   People a minute in consecutive slots from the start of the run. While the
   profile lasts it replaces `arrivalRatePerMinute`; after its last slot nobody
   arrives, as with an entry schedule. Absent: the constant rate, as before.
2. **`entrance.groupShare?: number` (0–1).** Share of arriving people who come in
   groups of two to four. Absent means 0.7, the value observed on a Saturday
   commercial walkway, so scenes get groups by default. The engine-level
   `SimulationSource.groupShare` defaults to 0, so code that builds sources
   directly (tests, harnesses) keeps single walkers. Benchmark scenarios set 0:
   they are tests of individual walkers.
3. **Group behaviour** (`walkingGroups.ts`): the group's first member leads.
   Only leaders are passed to the decision model; companions copy the leader's
   plan, and while the leader queues or pays they wait where they are instead
   of taking a place in the line. A group's free speed is its slowest member's
   times the observed size–speed ratio. Walking groups keep a side-by-side
   formation only when there is room; near a wall or among strangers they fall
   into file. Between companions only body contact acts.
4. **Anticipatory avoidance** (`crowdMovement.ts`, not a schema change): the
   time-to-collision force of Karamouzas, Skinner & Guy (2014) is added to the
   social-force model, replanned 20 times a simulated second.

## Consequences

- Scenes saved before this change now spawn groups. The arrival rate still
  counts people, not groups, so footfall is unchanged; walking speed, shop
  occupancy and the time people stay in the scene change.
- Arrivals draw from the simulation's random stream only when `groupShare > 0`;
  scenes with groups off keep their exact arrival sequence and benchmark hashes.
- A step costs more: about 7.2 ms against 4.9 ms with ~980 people on the demo
  scene (Node, same machine). The one-way fundamental diagram moves by at most
  0.03 m/s, so the 2026-09-14 parameter fit still holds.
- Not modelled: groups splitting and meeting again, companions shopping on
  their own, formation shapes other than a line, Moussaïd's own group forces.
