# Real-WebGPU parity harness (SP-1)

These `*.webgpu.ts` specs verify the GPU core against the CPU oracles
(`buildSpatialHashGridCpu`, `stepSocialForceCpu`, `exclusiveScanCpu`) on a
**real WebGPU device**. They are kept out of the default Node test run
(`pnpm test` matches `*.test.ts`, not `*.webgpu.ts`) and run via:

```bash
pnpm test:webgpu
```

Each spec self-skips when `navigator.gpu` is absent, so it never blocks CI
falsely and never reports a fake pass.

## Execution verdict (2026-06-24): LOCAL gate + manual smoke

This repo's sandbox/CI has **no usable WebGPU adapter** (probed 2026-06-21, see
the SP-1 plan header and `docs/CLAIMS_LEDGER.md`): the `webgpu` node package is
not installed, and headless Chromium yields no working device. So in CI/sandbox
`pnpm test:webgpu` reports **skipped**, and the GPU↔CPU parity + 100k benchmark
are a **local gate** run on a real WebGPU machine plus a manual three-browser
smoke. Do not treat a skipped run as a pass.

## Enabling a real device

Pick one on a machine where `chrome://gpu` shows WebGPU enabled:

- **Vitest browser mode (recommended):** add `@vitest/browser` + the Playwright
  provider and run these specs in a real Chromium so `navigator.gpu` is the
  browser's. Point `vitest.webgpu.config.ts` `test.browser` at chromium.
- **Node WebGPU runtime:** install the `webgpu` npm package and expose
  `navigator.gpu` before the run (a setup file), then `pnpm test:webgpu` runs in
  Node against that device.

When a real device runs green, flip the `docs/CLAIMS_LEDGER.md` "GPU readback
validation tests" / "WebGPU test execution" rows from skipped to measured.

## Specs

- `sortParity.webgpu.ts` — existing `buildSpatialHashGridGpu` vs CPU oracle (T0,
  proves the harness). SP-1 T2+ extends this dir with the new counting-sort
  (`sortParity`), fused-move (`moveParity`), `coreApi`, `benchmark100k`, and
  `determinism` specs — authored and verified on the real machine.
