# ADR 0004: WebGPU-only — remove the WebGL fallback

- Status: Superseded by ADR-0006 (2026-06-24)

> Superseded: the WebGPU-only / remove-WebGL stance below was never implemented
> (the SP-2 viewport kept a WebGL fallback). ADR-0006 reconciles docs with code:
> WebGPU for compute + a labeled, scale-limited WebGL/CPU compatibility mode,
> with no silent degradation. The original decision is kept here for history.

## Context

projectplan.md §2/§5 mandate WebGPU-only with an explicit unsupported notice,
but SimulationViewport.tsx:150-159 silently falls back to WebGL, violating the
hard constraint.

## Decision

Reaffirm WebGPU-only. The WebGL fallback in the viewport is removed in SP-2
(the viewport rewrite); when WebGPU is unavailable the app shows an explicit
unsupported message instead of degrading. (SP-0 only records the decision; the
code change lands in SP-2 to avoid touching runtime behavior here.)

## Consequences

- SP-2 must implement the explicit unsupported state.
- No WebGL code paths are added anywhere going forward.
