# CrowdSim SharedArrayBuffer Protocol

This document fixes the agent SoA contract shared by the main thread, WASM
behavior kernel, and GPU movement pipeline.

## Clocking

- GPU movement runs at the render cadence, normally 60 Hz.
- WASM behavior decisions run at 10 Hz and may enqueue DES events between ticks.
- The orchestrator owns the simulation clock and passes monotonic seconds into
  WASM with `EventQueue.sync_clock(timeSeconds)`.
- WASM may update behavior fields only after it has consumed due DES events for
  the current clock value.

## Agent State Codes

`behaviorState` is a `Uint32Array` lane. Codes are stable API:

| Code | State    | Meaning                        |
| ---- | -------- | ------------------------------ |
| 0    | Idle     | Agent exists but has no intent |
| 1    | Navigate | Moving toward a target/area    |
| 2    | Browse   | Dwell/browse behavior active   |
| 3    | Queue    | Waiting in a FIFO queue        |
| 4    | Service  | Being served by a facility     |
| 5    | Leave    | Leaving the scene or shop      |
| 6    | Evacuate | Evacuation override is active  |

Normal flow is `Idle -> Navigate -> Browse -> Queue -> Service -> Leave`.
Shortcuts allowed by the Rust state machine are `Navigate -> Leave`,
`Browse -> Leave`, and `Leave -> Idle`. Evacuation is not a normal transition;
it is an override that stores the previous state and writes `Evacuate`.

## SoA Lanes

All lanes are sized to `agentCapacity`. Offsets are 4-byte aligned.

| Lane            | Type           | Writer      | Readers        | Notes                             |
| --------------- | -------------- | ----------- | -------------- | --------------------------------- |
| `agentId`       | `Int32Array`   | worker      | UI, renderer   | Stable simulation agent id        |
| `behaviorState` | `Int32Array`   | WASM/worker | UI, GPU        | Uses the stable state codes above |
| `flags`         | `Int32Array`   | worker      | UI, GPU        | Bit flags below                   |
| `positionX`     | `Float32Array` | movement    | renderer, WASM | World-space meters                |
| `positionY`     | `Float32Array` | movement    | renderer, WASM | World-space meters                |
| `velocityX`     | `Float32Array` | movement    | renderer, WASM | World-space meters/second         |
| `velocityY`     | `Float32Array` | movement    | renderer, WASM | World-space meters/second         |
| `targetX`       | `Float32Array` | WASM/worker | movement, UI   | World-space movement target       |
| `targetY`       | `Float32Array` | WASM/worker | movement, UI   | World-space movement target       |

`flags` bits:

| Bit | Name                 | Meaning                                  |
| --- | -------------------- | ---------------------------------------- |
| 0   | `active`             | Slot contains a live agent               |
| 1   | `evacuationOverride` | State machine is currently overridden    |
| 2   | `targetDirty`        | GPU should re-read target coordinates    |
| 3   | `behaviorDirty`      | UI/debug views should re-read state data |

## Ownership Rules

- WASM is the semantic owner for `behaviorState`, `targetX`, and `targetY`; the
  worker copies the current snapshot values into SAB after each simulation tick.
- The movement backend is the semantic owner for `positionX`, `positionY`,
  `velocityX`, and `velocityY`; the worker copies the current snapshot values
  into SAB after each simulation tick.
- The worker writes `agentId` and `flags` while publishing each frame.
- The UI reads every lane but does not write shared agent memory.
- The orchestrator may allocate, resize, and zero buffers only while simulation
  is paused.
- Cross-thread writes to integer lanes must use `Atomics.store`; readers
  that need frame-perfect consistency use `Atomics.load`.
- Float lanes are double-buffered by frame ownership: GPU completes its movement
  pass before WASM reads positions for the next 10 Hz decision tick.

`targetFieldId` and `agentType` are reserved future lanes. The implemented phase
2.11 transport uses coordinate targets because the current live movement contract
already consumes `targetX` and `targetY`.

## Event Ownership

DES events live in WASM `EventQueue`; only durable state outcomes are written
back to SAB lanes. Event labels are debug output, not protocol state.
