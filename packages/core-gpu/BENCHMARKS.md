# SP-1 100k step-time benchmark

**STATUS: NOT YET MEASURED.** This sandbox has no usable WebGPU adapter, so
`test-webgpu/benchmark100k.webgpu.ts` self-skips and no step-time has been
recorded. The 60fps gate (`< 16.6 ms/step`) verdict is **PENDING** a real-WebGPU
machine. The GPU core (T2–T4) is authored but GPU-UNVERIFIED.

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
|------|-------------------|--------------|---------|
| —    | (pending real WebGPU machine) | (pending) | PENDING |
