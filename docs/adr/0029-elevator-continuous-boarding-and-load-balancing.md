# ADR-0029: Elevator continuous boarding and multi-car load balancing

Status: accepted. Builds on ADR-0010 stage 6 (`elevatorTransfers.ts`).

## Context

ADR-0010 stage 6's own record, carried forward into CLAUDE.md, disclosed
two specific gaps in the elevator dispatcher: "调度不前瞻不平衡负载；叫车
只在轿厢当前阶段结束的那一刻重新判定，开门期间不持续接单，中途到达的人
等下一趟而不是正在装的这一趟" — dispatch does not look ahead or balance
load; a call is only re-evaluated the instant a car's phase ends, so
someone arriving while the doors are already open waits for the car's next
trip rather than boarding the one currently loading. This is item 7 of the
ten-item backlog, picked up after ADR-0023 through ADR-0028.

`elevatorTransfers.ts`'s own module doc already explains why "lookahead"
in the sense a real multi-floor controller does it (predicting who else is
worth picking up along the way) does not apply here: a shaft is always
exactly two floors (`connectorSchema`'s own design — a three-floor bank is
two independent shafts), so there is no floor to pass by unpicked. What
the disclosed gap actually names, and what this ADR fixes, are two
narrower, real problems that do apply at two floors:

1. **A car does not keep accepting boarders while its doors are open.**
2. **A shaft with `carCount > 1` does not split a queue larger than one
   car's capacity across its idle cars** — a second idle car sits idle
   while people who could not fit in the first car wait for it to return,
   even when nothing else needs that second car.

## Decision

### Continuous boarding during the door-open window

`stepElevatorTravel`'s per-tick pass over cars already in `"boarding"`
phase now calls `board()` again every tick until `readyAtSeconds` (not
only once, at the moment boarding started) — anyone who reaches the hall
point while the doors are still open and there is still room boards the
car that is already loading, instead of being left for its next trip. This
does not change how long the doors stay open (`doorSeconds` is unchanged);
it only widens who gets to use that same window.

### Splitting overflow across a shaft's idle cars

The free-boarding pass (an idle car already at the calling floor boards
for free) now loops over **every** idle car at that floor, not just the
first — `board()` already re-reads the floor's waiting list net of who has
already boarded this tick, so a second idle car at the same floor
naturally picks up whatever the first car could not fit, with no separate
bookkeeping needed. The dispatch pass (send an idle car empty to fetch a
call at the other floor) now computes `carsNeeded =
ceil(stillWaiting.length / capacity)` and sends that many idle cars, not
one — so a queue of 5 people against a 2-person car and two available idle
cars sends both, rather than stranding the overflow for a car's second
trip.

### What this is still not

- **Not floor-passing lookahead.** Still moot at two floors per shaft, for
  the reason `elevatorTransfers.ts`'s own doc comment already gives.
- **Not predictive dispatch.** An idle car with no current call still does
  nothing — it does not pre-position itself based on a predicted future
  call (real elevator banks sometimes do exactly this). Nothing about
  demand pattern or time-of-day is modelled here to justify that.
- **Not a priority scheme.** Boarding order within a floor is still
  whoever is already in `waitingByFloor`'s own arrival order (`Array.prototype.filter`
  preserves it) — no VIP/accessibility priority lane, matching this
  project's other queues (checkout, transit boarding).

## Consequences

- `board()` itself is unchanged — both fixes are entirely in how
  `stepElevatorTravel` calls it (more often, and from more cars), not in
  what it does per call.
- The existing single-car, single-caller tests are unaffected: with one
  idle car and no simultaneous overflow, the loop bodies touch exactly the
  car and floor they always did.
