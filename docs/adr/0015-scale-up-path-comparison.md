# ADR 0015: Scale-up path — GPU reconnection vs. multi-scale (comparison only)

- Status: **Comparison written, path not started** — the gap-closure plan's
  own gate for batch 3.3 ("两条路二选一，先写 ADR 比较后再动手") is this
  document; it recommends a path but does not implement it. See this ADR's
  own Decision section for why implementation is not attempted here.
- Touches: nothing yet — no code changes in this ADR
- Related: ADR-0002 (100k GPU rewrite), ADR-0006 (WebGPU compute / WebGL
  render fallback, "no silent degradation"), `packages/core-gpu/BENCHMARKS.md`

## Context

Batch 3.3 names two candidate paths to scale past this project's current
~2,000-agent CPU ceiling: reconnect the already-built `gpuSimCore` (a
WebGPU compute movement core, benchmarked in isolation at 0.45 ms/step at
100k agents) to the app's real pipeline, or build a multi-scale
(micro-meso-macro / continuum-crowd) model where distant crowds are a
continuum flow and nearby crowds stay individual agents. The plan asks for
a comparison before picking one.

### What `gpuSimCore` actually has today

`packages/core-gpu/src/gpuSimCoreShaders.ts`'s fused-move kernel (~103
lines of WGSL) implements: desired-velocity relaxation, **linear**-falloff
agent repulsion, **linear**-falloff wall repulsion, a speed clamp, and
Euler integration. That is the entire behavioural surface. Its own
counting-sort spatial hash is real and does the hard part of GPU
neighbour-finding correctly.

### What the CPU crowd (`crowdMovement.ts`, 439 lines) actually has

The model every RiMEA test, every benchmark, and every feature this
project has shipped since is judged against: **exponential**-falloff
Helbing-form repulsion with anisotropy (people ahead matter more than
people behind), a sidestep force, Karamouzas et al.'s anticipation
(time-to-collision) force, group formation and following
(`walkingGroups.ts`, 290 lines), queueing and holding states (browse,
checkout, incapacitated), hazard/smoke exposure speed scaling and
avoidance (ADR-0012), stair/flight-lane speed overrides (`floorRouting.ts`,
476 lines), a hard wall-slide constraint (`sceneGeometry.ts`, 259 lines,
`wallIndex.ts`, 201 lines), a backward-motion clamp, overshoot prevention,
and deterministic per-step ordering.

**The gap between these two is not a rounding error.** `gpuSimCore`'s own
force model is a _different, simpler_ model (linear vs. exponential
falloff), not a subset of the CPU one with the same math. None of group
formation, queueing, anticipation, hazard exposure, stairs, or incapacitation
exist on the GPU side at all. Every ADR this project has written since
0006 (walking groups, multi-floor, population, smoke) added behaviour only
to the CPU path — the GPU core is, in the most literal sense, six ADRs
behind the model it would need to replace.

### A hard constraint this session cannot get around

CLAUDE.md's own rule: "改 WGSL 必须带 readback 校验测试" (a WGSL change
needs a readback verification test). `gpuSimCoreShaders.ts`'s own header
already discloses it was "authored against the CPU-oracle contract... but
NOT yet verified on a real WebGPU device (this sandbox has no adapter)" —
and that remains true in this session: there is no WebGPU adapter
available here to run the existing `test-webgpu/*.webgpu.ts` specs against,
let alone verify new shader code against a CPU oracle for parity. Every
prior real measurement of `gpuSimCore` in this project's own history
(`packages/core-gpu/BENCHMARKS.md`) was taken by a human running it in an
actual Chrome window on real hardware, not by an agent in this sandbox.

## Decision

**Recommend path (a), GPU reconnection, over multi-scale — but do not
start implementing it in this session.**

### Why GPU reconnection over multi-scale

1. Multi-scale has **zero prior art anywhere in this repository** — no
   code, no design doc, no citation beyond the plan's own one-sentence
   mention. It would mean inventing a continuum-crowd model (a
   density/velocity PDE solver, or an equivalent macroscopic
   approximation) and a micro/macro coupling boundary from scratch, with
   no existing scaffolding to build on. GPU reconnection at least starts
   from a real, benchmarked, if narrow, foundation.
2. Multi-scale's own payoff claim ("more practical above 100k") is not
   where this project's actual gap is. Today's ceiling is ~2,000 agents on
   CPU; getting to 100k does not need a fundamentally different modelling
   paradigm before it needs the _existing_ GPU core taught the behaviours
   the CPU path already has. A continuum layer for "crowds far away" is a
   reasonable idea for a much larger future scale target, not the next
   step from here.
3. Multi-scale would still eventually need _some_ GPU (or heavily
   optimised CPU) path for its own "near" discrete-agent tier at real
   scale — it does not avoid the GPU-parity work this ADR describes below,
   it just defers and adds a second, harder problem (the macro/micro
   coupling) on top of it.

### Why not start implementing GPU reconnection now

1. **It cannot be verified here.** No WebGPU adapter is available in this
   sandbox. CLAUDE.md's own gate for touching WGSL requires a readback
   test, and a readback test against no device is not a test — it is an
   assertion nobody has checked. Every prior benchmark number for
   `gpuSimCore` in this project's history was taken by a human on real
   hardware; writing new shader code that has never run, in a session that
   cannot run it, and presenting that as "done" would be exactly the class
   of claim this project's own history (the fabricated-AI cleanup, the
   reproducibility-hash deletion, the neural-residual rename) exists to
   prevent.
2. **The scope is not a session-sized unit of work.** Porting group
   formation, queueing, anticipation, hazard exposure, stairs and
   incapacitation to WGSL compute — each with its own parity test against
   the CPU oracle, the same rigour `gpuSimCoreParity.ts` already applies to
   the existing (much smaller) fused-move kernel — is the 2-4 week estimate
   the plan itself gives, and that estimate assumes a device to actually
   run and debug shader code against, which this session does not have
   either.
3. **A partial port is worse than no port.** ADR-0006's own rule is "no
   silent degradation" — a GPU path that handles movement but silently
   drops group cohesion, or stops respecting a queue, or ignores an
   incapacitated person's own hard-won invariant ("never counted as
   exited"), would not be a smaller version of the CPU model; it would be
   a _different, worse_ model wearing the same UI label. Every one of those
   behaviours has its own test suite proving it is not decorative — half-
   porting them without re-proving each one on the GPU side is not a
   defensible middle ground.

## What this ADR authorises and what it does not

**Authorised, if picked up later, by a session with real GPU access**:
extend `gpuSimCoreShaders.ts`'s fused-move kernel behaviour-by-behaviour,
each addition paired with its own CPU-oracle parity test
(`gpuSimCoreParity.ts`'s own established pattern) run against a real
device, in roughly the order the CPU model itself was built (exponential
falloff + anisotropy first, since everything else assumes that base is
right; group formation and queueing next, since those are the most
behaviourally load-bearing; hazard/stairs/incapacitation last, since they
are the most self-contained).

**Not authorised by this ADR**: writing untested WGSL in this session and
presenting it as working; any claim that GPU movement is "reconnected" or
"ready" short of full behavioural parity with the CPU model, verified on
real hardware; touching `movementBackend.ts`'s or `App.tsx`'s hardcoded
`"cpu-compat"` selection.

## Consequences

- Batch 3.3 is recorded as researched and decided, not completed. The
  gap-closure plan's own line item is updated to point here rather than
  left silently unstarted with no record of why.
- The actual multi-week GPU-parity effort remains future work, gated on
  access to a real WebGPU device for verification — a different kind of
  blocker than every other item in this plan, which needed only time, not
  hardware this environment lacks.
- Multi-scale is not rejected outright, only deprioritised behind closing
  the GPU core's own behavioural gap; if the product's actual scale target
  ever exceeds what a fully-ported GPU core can do, multi-scale becomes the
  next real question, informed by having a complete GPU model to build
  the "near" tier from instead of starting that from scratch too.
