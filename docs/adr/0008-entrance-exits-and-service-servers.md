# ADR 0008: Where arrivals go, and how many people a counter serves at once

- Status: Accepted (2026-09-14)
- Touches: scene schema (`entranceSchema`, `servicePointSchema`), editor
  round-trip, scene → engine config, mall-crowd decision backend, benchmarks

## Context

Two things a scene could not say, both found in the 2026-09-14 review.

1. **Where people entering at an entrance are heading.** With no shops, or once
   done shopping, everyone left by the exit nearest to them. A scene with a
   source and an exit on each side therefore sent each flow out beside its own
   source: the "counterflow" benchmark had no counterflow in it, and no scene
   could model a station concourse where people arriving from the platform head
   for the street and people from the street head for the platform.
2. **How many people a counter serves at once.** Everyone who reached a checkout
   was served immediately, in parallel, however many arrived. No queue could
   form at a till, which is the one queue a retail operator most wants to see.
   `capacityPerMinute` was already in the schema and read by nothing.

Commercial pedestrian tools model both the same way: origin–destination
assignment per entry point, and service points with a server count, a service
time distribution and a queue in front.

## Decision

1. **`entrance.exitIds?: string[]`** — the exits people who arrive through this
   entrance may leave by. Empty or absent means any exit, which is today's
   behaviour, so existing scenes are unchanged. When set, an arriving agent
   carries the list and always leaves by the nearest exit in it. Ids that name
   no exit in the scene are ignored; if none remain, any exit is allowed.
2. **Evacuation ignores `exitIds`.** In an emergency people take the nearest
   exit, not their planned one. (Exit-choice models with familiarity bias are
   future work.)
3. **`servicePoint.servers?: number`** (positive integer) — people served at
   once. When absent it is derived from the capacity the scene already declares:
   `max(1, round(capacityPerMinute × serviceMeanSeconds / 60))`, so a scene's
   stated throughput keeps meaning what it says.
4. **A counter with every server busy has a line.** A buyer who arrives joins it,
   in the slot order and head-first admission already used for shop lines
   (0.7 m spacing, growing toward the shops the buyers came from), and gives up
   and leaves when their patience runs out, as at a shop. A buyer picks the
   counter with the least expected time to finish: walking time plus the line
   ahead of them divided by its servers, times its mean service time.

## Consequences

- The schema gains two optional fields; old `.csim.json` files still parse and
  behave as before, except that a counter now serves at most its derived
  number of people at once.
- The editor carries both fields through its document round-trip (it had
  already been dropping service point names; that is fixed at the same time).
- The counterflow benchmark names its exits and becomes a real counterflow; its
  self-authored ranges are re-baselined and the change recorded in the ledger.
- Tests required: schema parses both fields; editor round-trip keeps them;
  arrivals leave only by their allowed exits; evacuation ignores them; a
  counter never has more than `servers` people in service; its line forms,
  admits head first, and reneges.
