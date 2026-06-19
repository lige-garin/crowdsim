# Architecture (actual, 2026-06-19)

Single source of truth for direction: docs/superpowers/specs/2026-06-19-city-sim-engine-design.md

## Packages
- `packages/core-gpu` — WGSL compute + WebGPU pipeline wrappers (spatial hash,
  social force, flow field, density, neural residual) + CPU mirrors used as
  test oracles. SP-1 adds `gpuSimCore.ts` (GPU-resident 100k core).
- `packages/core-behavior` — Rust → WASM: DES event queue (BinaryHeap), agent
  FSM, shops, queues, evacuation. Built via `pnpm build:wasm`.
- `packages/scene-schema` — `.csim.json` zod schema + shared types.
- `packages/app` — React app: scene editor, simulation viewport, dashboards,
  and ALSO the orchestration layer (simulationEngine.ts, simulationOrchestrator.ts,
  simulationMovementBridge.ts, simulationWorkerClient.ts, useSimulation* hooks).
  There is no separate `engine` package (see ADR 0005).
- `packages/backend` — Fetch-compatible backend: auth/session, projects,
  versions, read-only share, usage quota, AI proxy; Cloudflare D1/R2 contracts.
- `packages/collab` — project/version/share/usage data model.

## Data flow (current vs target)
- CURRENT: CPU straight-line mover is the default (simulationEngine.ts
  advanceAgentsCpu); GPU social force is an optional main-thread backend; the
  3D viewport renders a STATIC benchmark grid, not the sim. See CLAIMS_LEDGER.md.
- TARGET (SP-1/SP-2): GPU-resident agents stepped on GPU (social force + flow
  field), positions consumed directly by a drawIndirect renderer; zero
  per-frame readback. WASM handles 10Hz decisions.

## Constraints
- WebGPU only, no WebGL fallback (ADR 0004).
- Agent data is SoA TypedArray; fixed-step deterministic with seeded RNG.
