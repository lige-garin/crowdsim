# Architecture (actual; written 2026-06-19, refreshed 2026-07-28)

Single source of truth for direction: docs/superpowers/specs/2026-06-19-city-sim-engine-design.md

## Packages

- `packages/core-gpu` — WGSL compute + WebGPU pipeline wrappers (spatial hash,
  social force, flow field, density, residual correction) + CPU mirrors used as
  test oracles. SP-1 adds `gpuSimCore.ts` (GPU-resident 100k core, authored but
  GPU-UNVERIFIED). The file is still named `neuralResidualGpu.ts`, but the model
  it evaluates is a fitted linear projection, not a trained network — see the
  "4-3-2 residual MLP distillation" row in CLAIMS_LEDGER.md.
- `packages/core-behavior` — Rust → WASM: DES event queue (BinaryHeap), agent
  FSM, shops, queues, evacuation. Built via `pnpm build:wasm`.
- `packages/scene-schema` — `.csim.json` zod schema + shared types.
- `packages/app` — React app: scene editor, simulation viewport, dashboards,
  and ALSO the orchestration layer. The live chain is simulationEngine.ts,
  simulationMovementBridge.ts, simulationWorkerClient.ts and the
  useSimulation\* hooks (`App.tsx` mounts `useSimulationController` and
  `useSimulationWorkerController`). There is no separate `engine` package
  (see ADR 0005). NOTE: `simulationOrchestrator.ts` is NOT part of this chain —
  it is dead code, referenced only by its own `simulationOrchestrator.test.ts`
  (re-verified 2026-07-28). See "Orphan modules" below.
- `packages/backend` — Fetch-compatible backend: auth/session, projects,
  versions, read-only share, usage quota, AI proxy; Cloudflare D1/R2 contracts.
- `packages/collab` — project/version/share/usage data model.

## Data flow (current vs target)

- CURRENT: CPU straight-line mover is the default (simulationEngine.ts
  advanceAgentsCpu, cap 2000); GPU social force is an optional main-thread
  backend. The 3D viewport DOES render the live crowd: since SP-2 the
  `InstancedMesh` is driven from the simulation snapshot each frame via
  `agentWorldPosition`, and the static `benchmarkAgentPosition` grid is gone.
  The instance capacity is `viewportAgentCapacity` (8,192, an allocation — not
  a scale claim); `agents.count` tracks the live crowd. See CLAIMS_LEDGER.md.
- TARGET (SP-1/SP-2): GPU-resident agents stepped on GPU (social force + flow
  field), positions consumed directly by a drawIndirect renderer; zero
  per-frame readback. WASM handles 10Hz decisions.

## Constraints

- WebGPU for compute. WebGL/CPU is a labeled, scale-limited compatibility mode
  with no silent degradation — ADR 0006 supersedes ADR 0004, which had claimed
  WebGPU-only with the WebGL fallback removed (it never was). When WebGPU is
  unavailable the viewport shows a readable blocking card
  (`data-testid="viewport-unsupported"`), not a silent black canvas.
- Agent data is SoA TypedArray; fixed-step deterministic with seeded RNG.

## Orphan modules (verified 2026-07-28)

These live under `packages/app/src` but sit on no runtime path — a repo-wide
grep of each module's exported symbols (excluding `node_modules`, `dist` and
`*.test.*`) matches only the module itself, so the sole importer is its own
test:

`simulationOrchestrator.ts`, `odCalibration.ts`, `odSensitivity.ts`,
`odFlowAnalysis.ts`, `verticalTransport.ts`, `weatherIntegration.ts`,
`aiMallAutomation.ts`, `useWasmSimulationDecisionBackend.ts` — eight modules,
all still present.

`agentLifecycle.ts` was on this list too and was deleted (with its test) during
the same day's work, which is why it no longer appears above.

Two related-but-different cases:

- `createGpuSimCore` (`packages/core-gpu`) is exported from `src/index.ts`, but
  its only consumers are the `test-webgpu/` specs, which all skip in this
  sandbox. Nothing in `packages/app` imports it.
- `createExperimentWorker` / `runExperimentInBackgroundWorker`
  (`experimentWorkerClient.ts`) are called only from
  `experimentWorkerClient.test.ts`. The mounted `ExperimentSweepPanel` runs
  `runExperiment` synchronously on the main thread and merely renders the
  worker request descriptor as text.

Their tests pass, so `pnpm test` gives no signal that this code is unreachable.
Decide per module whether to wire it up or delete it; do not cite any of them
as a shipped capability.
