# ADR 0002: Performance target is 100k agents @60fps via full GPU rewrite

- Status: Accepted (2026-06-19)
- Supersedes: the interim "pragmatic ~10k" target discussed 2026-06-19

## Context
The current GPU path re-allocates buffers and reads everything back to CPU
every call (packages/core-gpu/src/spatialGpu.ts:36-198) and sorts O(n²)
(spatialHashGrid.wgsl sort_agents). The live default sim is CPU straight-line
movement capped at 2000 agents. None of this can reach the target.

## Decision
Target is 100,000 agents at 60fps. SP-1 rewrites the GPU pipeline:
GPU-resident SoA with ping-pong buffers, prefix-sum counting sort (replacing
O(n²)), fused movement step, zero per-frame position readback, and
drawIndirect rendering (SP-2). Cross-device determinism is tolerance-based
(not bit-exact); recorded as an accepted trade-off.

## Consequences
- spatialGpu.ts full-readback path is retained only as a test oracle.
- The 100k @60fps number is a gate measured on real hardware (SP-1 exit gate),
  not a projection. If unmet, record the measured number and an optimization
  backlog rather than claiming success.
