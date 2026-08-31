# SP-1 100k step-time benchmark

**STATUS: MEASURED (2026-08-31, one machine).** The 100k social-force step runs
at **0.13–0.21 ms/step** on an NVIDIA Lovelace adapter via Chrome 149 WebGPU —
roughly 80× under the 16.6 ms/step 60fps budget. The measurement was taken
inside a real Chrome page (Node lacks `navigator.gpu`, so the vitest
node-side specs still self-skip) by importing the core through the vite dev
server and replicating `benchmark100k.webgpu.ts` exactly: same layout, params,
spawn grid, 10 warmup steps, then 3 × 100 timed steps each ending in
`queue.onSubmittedWorkDone()`.

Scope caveats (keep claiming honestly):

- This measures the **GPU movement core step only** (counting sort + fused
  social-force move). Full-app 60fps — which also includes decisions,
  readbacks, and three.js rendering — remains unmeasured.
- One machine, one browser, one run day. Parity/determinism specs
  (`moveParity`/`sortParity`/`determinism`/`coreApi`) still have no real-device
  execution; only the benchmark spec's code path has been exercised.

Re-probed 2026-07-28: `pnpm test:webgpu` still reports `5 skipped (5)` files /
`7 skipped (7)` tests in Node — unchanged today; the page-context harness is
the only real-device path that has actually produced numbers.

## How to measure

On a machine where `chrome://gpu` shows WebGPU enabled, enable a real device
(see `test-webgpu/README.md`) and run:

```bash
pnpm test:webgpu
```

Record the printed `100k ms/step = X` below with the hardware/driver and date,
then set the verdict honestly:

- `X < 16.6` → 60fps gate **MET**.
- otherwise → record `X` plus an optimization backlog; **do not claim 60fps**.

### Known optimization backlog (per ADR-0002)

- `add_block_offsets` currently sums preceding block totals in an O(blocks²)
  loop — replace with a cascaded/recursive scan for large `cellCount`.
- Workgroup-size tuning for count/scatter/move.
- Reduce atomics contention in dense cells.

## Recorded results

| Date | Hardware / driver | 100k ms/step | Verdict |
| ---- | ----------------- | ------------ | ------- |
| 2026-08-31 | NVIDIA Lovelace (adapter.info), Chrome 149.0.7827.55, Windows 10, page-context harness | 0.211 / 0.131 / 0.148 (3 runs of 100 steps) | **60fps gate MET for the core step** (~80× headroom); full-app fps unmeasured |
| — | (pending real WebGPU machine) | (pending) | superseded by the row above |
