# SP-1 100k step-time benchmark

**STATUS: MEASURED on a verified-working pipeline (2026-08-31, one machine).**
The 100k social-force step runs at **0.45–0.46 ms/step** (best runs; one 5.8 ms
outlier observed) on an NVIDIA Lovelace adapter via Chrome 149 WebGPU — roughly
**36× under the 16.6 ms/step 60fps budget**. Measured inside a real Chrome page
(Node lacks `navigator.gpu`, so the vitest node-side specs still self-skip) by
importing the core through the vite dev server and replicating
`benchmark100k.webgpu.ts`: same layout, params, spawn grid, 10 warmup steps,
then 3 × 100 timed steps each ending in `queue.onSubmittedWorkDone()`.

**Correction (same day): the first numbers recorded here — 0.13–0.21 ms/step —
were invalid.** They were taken before two real-device bugs were found and
fixed:

1. The scan shader used `meta` as a WGSL identifier — a reserved keyword that
   Chrome 149's parser rejects, so any pipeline touching it failed to compile.
2. The fused move shader binds **10 storage buffers**, above the WebGPU default
   per-stage limit of 8. On a default `requestDevice()` the move pipeline fails
   validation _silently_, and every `step()` still costs submission time —
   which is exactly how the earlier run measured a dead pipeline.

Both are fixed: `scanMeta` rename in `gpuSimCoreShaders.ts`, a fail-loud
`maxStorageBuffersPerShaderStage >= 10` check in `createMovePipeline`, and
`requiredLimits` in every real-device spec. The corrected run was taken only
after the parity harness proved the pipeline live at 100k (agents actually
displace; `readAggregates` returns a physically plausible density field).

Real-device parity/determinism, run in the same harness (6/6 PASS):

- sortParity: 4-agent exact grid vs CPU oracle; 1k offsets exact + per-cell
  buckets equal.
- moveParity: fused GPU move matches `stepSocialForceCpu` within 1e-3 over 20
  steps (256 agents, wall included).
- liveness: fused move displaces all 100k agents.
- determinism: 50 steps with zero buffer mappings; twin cores identical after
  40 steps (cellCounts exact, positions within 1e-3).

Scope caveats (keep claiming honestly):

- This measures the **GPU movement core step only** (counting sort + fused
  social-force move). Full-app 60fps — which also includes decisions,
  readbacks, and three.js rendering — remains unmeasured. For reference, the
  live workbench HUD showed ~32 fps at 34 agents in the same Chrome.
- One machine, one browser, one run day; one 5.8 ms outlier among the runs.
- The vitest specs still self-skip in Node (`pnpm test:webgpu` = green-but-
  skipped); the page-context harness is the only real-device path that has
  produced numbers.

## How to measure

On a machine where `chrome://gpu` shows WebGPU enabled, run the specs with a
device that requests the raised limit:

```bash
pnpm test:webgpu   # Node: self-skips; needs a browser-mode harness
```

The real-device path used here: load the app in Chrome, import the core via the
vite dev server, `requestDevice({ requiredLimits: { maxStorageBuffersPerShaderStage: 10 } })`,
and replicate `benchmark100k.webgpu.ts`. Record `100k ms/step` below with
hardware/driver and date:

- `X < 16.6` → 60fps gate **MET**.
- otherwise → record `X` plus an optimization backlog; **do not claim 60fps**.

### Known optimization backlog (per ADR-0002)

- `add_block_offsets` currently sums preceding block totals in an O(blocks²)
  loop — replace with a cascaded/recursive scan for large `cellCount`.
- Workgroup-size tuning for count/scatter/move.
- Reduce atomics contention in dense cells.

## Recorded results

| Date       | Hardware / driver                                                                                                                                      | 100k ms/step                                | Verdict                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 2026-08-31 | NVIDIA Lovelace, Chrome 149.0.7827.55, Windows 10, page-context harness, **working pipeline** (post `scanMeta` + storage-limit fixes, liveness proven) | 0.465 / 5.759 / 0.446 (3 runs of 100 steps) | **60fps gate MET for the core step** (~36× headroom); full-app fps unmeasured                  |
| 2026-09-13 | NVIDIA Lovelace, user's Chrome (`maxStorageBuffersPerShaderStage: 16`), driven live from the app page via `/@fs` import of the built core              | 1.347 / 0.781 / 0.411 (3 runs of 100 steps) | re-confirmed on live hardware; **liveness checked** — 61,505 non-empty cells, max 298 per cell |
| 2026-08-31 | same, **invalid** — measured on a silently-dead move pipeline (see correction above)                                                                   | 0.211 / 0.131 / 0.148                       | superseded — do not quote                                                                      |

## CPU path scaling (why the GPU core is needed, not a nice-to-have)

Measured 2026-09-12 on the `biocity-rainy-high-street` demo scene, Node/vitest,
`createSimulationEngineFromScene(...).step(1)` wall-clock per fixed step
(includes the per-step snapshot the app also pays). The crowd was filled to the
target count, warmed up 10 steps, then 40 steps timed.

| agents | median ms/step | p95    | verdict                     |
| ------ | -------------- | ------ | --------------------------- |
| 1,000  | 2.78           | 4.54   | 60Hz, 17% of frame          |
| 2,000  | 8.64           | 10.96  | 60Hz, 52% of frame          |
| 5,000  | 31.79          | 34.65  | 30Hz only                   |
| 10,000 | 170.27         | 253.52 | an order of magnitude short |

Cost is **super-linear**: ×5 agents costs ×19.7 time (≈ O(n^1.85)). The 2m grid
with a 3×3 neighbourhood is O(n) only when agents spread out; this scene is a
corridor ~15m tall in a 96m world, so density per cell grows with the crowd and
the neighbour scan degrades with it.

Consequences, recorded so nobody re-derives them:

- `crowdBudget.maxAgents = 2,000` is an **honest 60Hz ceiling** for the CPU
  path on this scene, not a placeholder or a conservative guess.
- "上万顾客" is not reachable by raising a constant. It needs the resident GPU
  core, which is what the retail-first spec already called the 命门.
- A different scene geometry (a wide atrium rather than a corridor) would move
  these numbers; they are scene-specific, not a universal engine figure.

### The two paths, per agent per step

Same machine, 2026-09-13. This is the number that decides whether the resident
core is worth its architectural seam:

| path                                               | agents  | ms/step | per agent     |
| -------------------------------------------------- | ------- | ------- | ------------- |
| CPU engine (object array, 2m grid)                 | 10,000  | 170.27  | **17 µs**     |
| resident GPU core (SoA, counting sort, fused move) | 100,000 | 0.411   | **0.0041 µs** |

Four orders of magnitude. The caveat that keeps this honest: these measure
different work. The CPU figure is a full engine step — spawn, decisions,
movement, wall constraints, exits, and the per-step snapshot the UI consumes.
The GPU figure is the movement kernel only, with no decisions, no spawning and
no readback. The comparison says the movement kernel is not the bottleneck at
100k; it does not say the whole app runs at 100k.
