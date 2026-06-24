# ADR 0006: WebGPU for compute, labeled WebGL render fallback (supersedes 0004)

- Status: Accepted (2026-06-24)
- Supersedes: ADR-0004 (WebGPU-only, remove WebGL fallback)

## Context
ADR-0004 reaffirmed "WebGPU-only: remove the WebGL fallback / show an explicit
unsupported notice." But the SP-2 viewport rewrite did NOT remove the fallback:
`SimulationViewport.tsx` imports both `WebGLRenderer` and `WebGPURenderer` and
calls `createFallbackRenderer()` (WebGL) when `navigator.gpu` is absent. So
docs and code contradicted each other, and the fallback degraded silently with
no user-visible indication of which path was running.

Two facts drive the decision:
- The GPU-resident 100k crowd core (SP-1 / P1) can only run on WebGPU. A machine
  without WebGPU can never run that path.
- Retail-device coverage matters for the product direction
  (`docs/superpowers/specs/2026-06-24-retail-first-execution-plan.md`); cutting
  every non-WebGPU device is more costly than offering a clearly-labeled,
  scale-limited preview path.

## Decision
1. **Simulation compute requires WebGPU.** The GPU-resident 100k core runs only
   on WebGPU. Without WebGPU the simulation degrades to the CPU worker path
   (~2000-agent cap) — a preview/edit experience, NOT the full crowd. This is a
   capability difference, not a silent downgrade.
2. **Rendering may fall back.** The target form (P3) is to migrate the viewport
   to Three.js `WebGPURenderer`, which itself auto-falls-back to WebGL2 when
   WebGPU is unavailable — so we do not hand-maintain two renderers long-term.
   **P0 does not touch `createFallbackRenderer`**; the existing WebGPU-first /
   WebGL-fallback renderer stays until the P3 migration.
3. **No silent degradation.** When WebGPU is unavailable the UI explicitly says
   so. The viewport HUD shows a mode badge: `完整 GPU 模式 / Full GPU mode` vs
   `兼容模式 · CPU · 规模受限 / Compatibility mode · CPU · scale-limited`. The
   compatibility badge carries the caveat "preview/edit only — small-scale, not
   calibrated analysis", and compat-mode crowd/density figures must NOT be
   presented with the caliber of full-scale analysis results.

## Consequences
- ADR-0004 is superseded; its WebGPU-only / remove-WebGL stance no longer holds.
- The viewport gains a tested mode badge (`describeViewportRenderMode`,
  `SimulationViewport.renderMode.test.ts`) and sets the mode on each render path
  (`full-gpu` / `compat` / `unsupported`).
- The P3 viewport migration to `WebGPURenderer` (with built-in WebGL2 fallback)
  is the path to retiring the hand-rolled `createFallbackRenderer`.
- Any analysis/report surface must not treat compatibility-mode output as
  full-scale, calibrated results.
