# Architecture (actual; rewritten 2026-10-02 at `90f0b14`, working tree clean)

Direction and boundaries live in `docs/adr/` (34 ADRs); the claims audit
trail is `docs/CLAIMS_LEDGER.md`.

## Packages

- `packages/app` — The React app: scene editor (2D plan + 3D build), simulation
  viewport, analysis panels, and the orchestration layer. There is no separate
  `engine` package (ADR-0005). The live chain is `engine/simulationEngine.ts`,
  the worker (`engine/simulation.worker.ts`) and the `useSimulation*` hooks.
  Source is grouped into `engine/`, `editor/`, `analytics/`, `charts/`,
  `panels/`, `viewport/`, `scenes/`, `renderer/`, `research/`, `rimea/`.
- `packages/scene-schema` — The `.csim.json` scene format (Zod schema), shared
  TS/Rust types.
- `packages/core-gpu` — WGSL/WebGPU compute: the `gpuSimCore` movement kernel
  (spatial hashing, social force, formation/anticipation/hazard forces) plus
  CPU mirrors used as test oracles and benchmarks.
- `packages/core-behavior` — Rust → WASM discrete-event/state-machine
  behavior kernel. Real and tested, but the app's default decision backend is
  the TypeScript `mallCrowdDecisionBackend.ts`; `wasmDecisionBackend` defaults
  to `false` everywhere in the running app.

`packages/backend` and `packages/collab` (an optional auth/projects/share
backend) were deleted in 2026-09 — see `docs/CLAIMS_LEDGER.md` if you are
looking for them. The app makes no network requests except the user-triggered
live-weather panel (Open-Meteo).

## Data flow

- **Movement (default: CPU).** Social-force model in `engine/crowdMovement.ts`
  (parameters fitted to the Weidmann fundamental diagram — see
  `docs/calibration/`), stepped inside the simulation worker on the CPU, with
  a hard agent cap of 2,000 (`engine/crowdBudget.ts`).
- **Movement (GPU, experimental).** ADR-0033 wires `createGpuSimCore` from
  `packages/core-gpu` into the live engine (`engine/gpuCrowdBackend.ts`,
  `advanceAgentsGpu`): per-floor core pool, slot allocator with
  swap-compaction, and an async `stepAsync`/`tickAsync` API. It is selected by
  the labelled "GPU movement (experimental)" toggle / `?gpumove` URL flag,
  acquires the device once at worker init, and falls back to CPU on
  `device.lost`. Measured on real hardware the crossover is at roughly
  750–1000 agents: below that the CPU path is faster; at the 2000-agent cap
  the GPU path stays near 6 ms/step while the CPU path exceeds the frame
  budget. It is **not** the default, and the sync `step()`/`tick()` fail loud
  in GPU mode rather than silently running CPU.
- **Decisions.** TypeScript decision backend (queues, shopping, evacuation) at
  a lower tick rate; the WASM backend exists behind a flag.
- **Rendering.** three.js: `InstancedMesh` crowd driven from the simulation
  snapshot each frame, nearest-12 skinned animated characters within 20 m of
  the camera (ADR-0032), GTAO/bloom/day-night/weather post pipeline.

## Constraints

- WebGPU for compute and the primary render path. WebGL/CPU is a labelled,
  scale-limited compatibility mode with no silent degradation (ADR-0006
  supersedes ADR-0004). When even the render fallback is unavailable the
  viewport shows a readable blocking card
  (`data-testid="viewport-unsupported"`), not a silent black canvas.
- Agent data is SoA TypedArray; fixed-step deterministic with seeded RNG.
- COOP/COEP response headers are a hard launch constraint for the zero-copy
  SharedArrayBuffer overlay — see `docs/DEPLOYMENT.md`.

## Formerly-orphaned modules

The 2026-07-28 orphan list (`simulationOrchestrator.ts`, `odCalibration.ts`,
`verticalTransport.ts`, `weatherIntegration.ts`, `aiMallAutomation.ts`, …)
has been fully resolved: every one of those modules was since either wired
in or deleted. `createGpuSimCore` is wired into the live engine (ADR-0033);
`runExperimentInBackgroundWorker` is used by the mounted
`ExperimentSweepPanel`. The standing project rule remains: a module that is
written but sits on no runtime path must be either wired or deleted — being
present-but-misleading is the one disallowed state.
