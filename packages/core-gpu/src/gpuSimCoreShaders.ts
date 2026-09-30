// SP-1 GPU-resident core shaders. STATUS: authored against the CPU-oracle
// contract (buildSpatialHashGridCpu / stepSocialForceCpu / exclusiveScanCpu) but
// NOT yet verified on a real WebGPU device (this sandbox has no adapter). The
// parity specs in test-webgpu/ are the correctness gate; iterate these strings
// against `pnpm test:webgpu` on real hardware (see test-webgpu/README.md).

// Params buffer matches createGridParams (gpuUtils.ts):
//   [0]=count, [1]=columns, [2]=rows, [3]=cellCount, [4]=cellSize (f32 bits)

export const SORT_WORKGROUP = 64;
export const SCAN_WORKGROUP = 256;

// Pass 1: clear is done on the host (writeBuffer zeros); count tallies agents per cell.
export const countShader = /* wgsl */ `
@group(0) @binding(0) var<storage, read> params: array<u32>;
@group(0) @binding(1) var<storage, read> positions: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> cellCounts: array<atomic<u32>>;
fn cellSize() -> f32 { return bitcast<f32>(params[4]); }
fn cellOf(p: vec2<f32>) -> u32 {
  let c = min(u32(max(floor(p.x / cellSize()), 0.0)), params[1] - 1u);
  let r = min(u32(max(floor(p.y / cellSize()), 0.0)), params[2] - 1u);
  return r * params[1] + c;
}
@compute @workgroup_size(64) fn count(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= params[0]) { return; }
  atomicAdd(&cellCounts[cellOf(positions[id.x])], 1u);
}`;

// Pass 3: scatter agent ids into per-cell buckets using cellOffsets + an atomic cursor.
export const scatterShader = /* wgsl */ `
@group(0) @binding(0) var<storage, read> params: array<u32>;
@group(0) @binding(1) var<storage, read> positions: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read> cellOffsets: array<u32>;
@group(0) @binding(3) var<storage, read_write> cellCursor: array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> sortedAgentIds: array<u32>;
fn cellSize() -> f32 { return bitcast<f32>(params[4]); }
fn cellOf(p: vec2<f32>) -> u32 {
  let c = min(u32(max(floor(p.x / cellSize()), 0.0)), params[1] - 1u);
  let r = min(u32(max(floor(p.y / cellSize()), 0.0)), params[2] - 1u);
  return r * params[1] + c;
}
@compute @workgroup_size(64) fn scatter(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= params[0]) { return; }
  let cell = cellOf(positions[id.x]);
  let slot = cellOffsets[cell] + atomicAdd(&cellCursor[cell], 1u);
  sortedAgentIds[slot] = id.x;
}`;

// Pass 2: exclusive prefix-sum over cellCounts -> cellOffsets (len = cellCount+1).
// Hillis-Steele per-block inclusive scan -> exclusive, per-block totals, then add
// preceding block totals. meta[0] = cellCount. Oracle: exclusiveScanCpu (T1).
export const scanShader = /* wgsl */ `
@group(0) @binding(0) var<storage, read> counts: array<u32>;
@group(0) @binding(1) var<storage, read_write> offsets: array<u32>;  // len = n+1
@group(0) @binding(2) var<storage, read_write> blockTotals: array<u32>;
@group(0) @binding(3) var<storage, read> scanMeta: array<u32>;           // [n]
var<workgroup> tile: array<u32, 256>;
@compute @workgroup_size(256)
fn scan_blocks(@builtin(global_invocation_id) gid: vec3<u32>,
               @builtin(local_invocation_id) lid: vec3<u32>,
               @builtin(workgroup_id) wid: vec3<u32>) {
  let n = scanMeta[0];
  let i = gid.x;
  tile[lid.x] = select(0u, counts[i], i < n);
  workgroupBarrier();
  var offset = 1u;
  for (; offset < 256u; offset = offset << 1u) {
    var v = 0u;
    if (lid.x >= offset) { v = tile[lid.x - offset]; }
    workgroupBarrier();
    tile[lid.x] = tile[lid.x] + v;
    workgroupBarrier();
  }
  let inclusive = tile[lid.x];
  let exclusive = inclusive - select(0u, counts[i], i < n);
  if (i < n) { offsets[i] = exclusive; }
  if (lid.x == 255u) { blockTotals[wid.x] = inclusive; }
}
@compute @workgroup_size(256)
fn add_block_offsets(@builtin(global_invocation_id) gid: vec3<u32>,
                     @builtin(workgroup_id) wid: vec3<u32>) {
  let n = scanMeta[0];
  let i = gid.x;
  if (i >= n) { return; }
  var acc = 0u;
  for (var b = 0u; b < wid.x; b = b + 1u) { acc = acc + blockTotals[b]; }
  offsets[i] = offsets[i] + acc;
  if (i == n - 1u) { offsets[n] = offsets[i] + counts[i]; }
}`;

// Fused movement step. ADR-0015 stage 1: ports stepGpuSimCoreSocialForceCpu
// (gpuSimCoreSocialForce.ts) exactly — desired-velocity relaxation +
// exponential-falloff, anisotropic agent repulsion with a contact-stiffness
// term over the sorted 3x3 neighborhood (valid because
// interactionRangeMeters <= cellSize, asserted on the host — see
// gpuSimCoreSocialForce.ts's own doc comment for why that's a different
// invariant than the old agentRepulsionRange <= cellSize one) + wall
// repulsion + maxSpeed clamp + integrate. Reads positionsIn/velocitiesIn,
// writes positionsOut/velocitiesOut (ping-pong).
//
// Stage 2 (same file's own doc comment for the full rationale): adds the
// in-formation spring force, gated by wallClose/strangersClose computed in
// the SAME wall and neighbour loops the base force already runs — no new
// passes. groupId < 0 is "not in a group"; formationSlots is only read for
// agents with a real group. formationGain/formationRoomMeters are WGSL
// constants, not MoveParams fields — crowdMovement.ts hardcodes both too.
//
// Stage 3: agent repulsion now zeroes (but the contact-overlap term still
// applies) between two agents in the same group — a real parity gap in
// stage 1/2 fixed here, not present before because groups didn't exist yet
// when stage 1 landed. Adds the perpendicular sidestep nudge for anyone
// roughly ahead and not in the same group, reusing the same push magnitude
// — `sidestep`/`sidestepCone` ARE calibrated `socialForceParameters` fields
// (unlike formation's constants), so they're MoveParams fields.
//
// Stage 4: the Karamouzas/Skinner/Guy time-to-collision anticipation push
// (gpuSimCoreSocialForce.ts's own doc comment has the full citation and
// formula). A SEPARATE pass over the same 3x3 neighbourhood, not fused into
// the repulsion loop above — it uses its own range
// (anticipationRangeMeters, independent of interactionRangeMeters) and its
// own geometric test (closing speed + discriminant, not distance alone),
// exactly like crowdMovement.ts itself calls anticipation() as a separate
// function after its own repulsion loop. The summed push is clamped to
// anticipationMaxAcceleration once, after every neighbour's contribution is
// added — not per-neighbour.
//
// Stage 5: hazard avoidance (ADR-0012) — steering away from the worst
// fire/smoke source exposing an agent. Not a neighbour force at all: a
// function of one agent's own position, one hazard's position, and that
// agent's exposure, computed once per DECISION tick by
// simulationEngine.ts's hazardAvoidancePush and passed in exactly like
// formationSlots already is — a higher-level system's per-agent output, so
// there is no loop for it here, just a direct add.
//
// Stage 6: crowdMovement.ts's own two-part integration
// (gpuSimCoreSocialForce.ts's integrateWithRelaxation() doc comment has the
// full rationale) — desiredSpeed eases with distance to target (a real
// discrepancy from stages 1-5's flat freeSpeed target, present since stage
// 1 and not specific to holding), holding agents ease over holdEaseMeters
// instead, and the final clamp is freeSpeed * maxSpeedRatio (a per-agent
// cap), not the flat params.maxSpeed stages 1-5 used. Pushes are Euler-
// integrated into velocity first; relaxation toward the desired heading is
// then solved exactly as a linear ODE over dt, not approximated by folding
// it into the same Euler step as the pushes.
//
// Stage 7: the no-walking-backward clamp. crowdMovement.ts zeroes only the
// along-heading component of velocity when it points backward relative to
// desired, right after relaxation and BEFORE the maxSpeedRatio clamp —
// never for a holding agent (reuses the same holding buffer stage 6 already
// added, no new binding). Sideways motion is untouched; this only stops a
// dense corridor's forward-pushing repulsion from driving someone backward
// along their own route.
//
// Stage 8 (last stage in ADR-0015): never walk past the target within one
// step. Applied LAST, after the maxSpeedRatio clamp — crowdMovement.ts
// scales velocity down using the ALREADY-clamped speed, so this can only
// shrink a step, never re-widen one the speed clamp just shrank. Never for
// a holding agent, same gate as stages 6/7 (no new binding — reuses
// `distance`, already computed above for the relaxation target).
//
// ADR-0033 (engine wiring, not a new ADR-0015 stage — the force math below
// is unchanged, only where its direction input comes from): crowdMovement.ts
// does NOT walk straight at `targetX`/`targetY` for a non-holding agent — it
// calls `router.direction()`, which returns the straight-line direction only
// when there is line of sight, and otherwise the steepest-descent direction
// along a precomputed Dijkstra distance field (routing around walls/corners).
// `distance` (used for desired-speed easing and the overshoot clamp) stays
// tied to the literal target; only the WALKING DIRECTION is decoupled from
// it. `routedHeading` carries that pre-routed direction from the host (which
// alone has the routing grid) — the kernel no longer derives `desired` from
// `targets` itself. A host that has nothing to route around (no walls) can
// simply upload the straight-line direction, which is what routing degrades
// to anyway (`straightLineRouter()` in crowdNavigation.ts).
export const FUSED_MOVE_WORKGROUP = 64;
export const fusedMoveShader = /* wgsl */ `
struct MoveParams {
  count: u32,
  columns: u32,
  rows: u32,
  cellCount: u32,
  cellSize: f32,
  dt: f32,
  desiredSpeed: f32,
  relaxationTime: f32,
  agentRepulsionStrength: f32,
  agentRepulsionRange: f32,
  wallRepulsionStrength: f32,
  wallRepulsionRange: f32,
  maxSpeed: f32,
  wallCount: u32,
  anisotropy: f32,
  contactStiffness: f32,
  interactionRangeMeters: f32,
  sidestep: f32,
  sidestepCone: f32,
  anticipationStrength: f32,
  anticipationHorizonSeconds: f32,
  anticipationRangeMeters: f32,
  anticipationMaxAcceleration: f32,
  holdEaseMeters: f32,
  maxSpeedRatio: f32,
};
@group(0) @binding(0) var<storage, read> params: MoveParams;
@group(0) @binding(1) var<storage, read> positionsIn: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read> velocitiesIn: array<vec2<f32>>;
@group(0) @binding(3) var<storage, read> targets: array<vec2<f32>>;
@group(0) @binding(4) var<storage, read> speed: array<f32>;
@group(0) @binding(5) var<storage, read> radii: array<f32>;
@group(0) @binding(6) var<storage, read> cellOffsets: array<u32>;
@group(0) @binding(7) var<storage, read> sortedAgentIds: array<u32>;
@group(0) @binding(8) var<storage, read> walls: array<vec4<f32>>;
@group(0) @binding(9) var<storage, read_write> positionsOut: array<vec2<f32>>;
@group(0) @binding(10) var<storage, read_write> velocitiesOut: array<vec2<f32>>;
@group(0) @binding(11) var<storage, read> groupIds: array<i32>;
@group(0) @binding(12) var<storage, read> formationSlots: array<vec2<f32>>;
@group(0) @binding(13) var<storage, read> hazardAvoidance: array<vec2<f32>>;
@group(0) @binding(14) var<storage, read> holding: array<u32>;
@group(0) @binding(15) var<storage, read> routedHeading: array<vec2<f32>>;

const formationGain: f32 = 1.0;
const formationRoomMeters: f32 = 1.0;

fn cellOf(p: vec2<f32>) -> u32 {
  let c = min(u32(max(floor(p.x / params.cellSize), 0.0)), params.columns - 1u);
  let r = min(u32(max(floor(p.y / params.cellSize), 0.0)), params.rows - 1u);
  return r * params.columns + c;
}
fn closestOnSegment(p: vec2<f32>, w: vec4<f32>) -> vec2<f32> {
  let a = w.xy;
  let ab = w.zw - w.xy;
  let denom = max(dot(ab, ab), 0.0001);
  let t = clamp(dot(p - a, ab) / denom, 0.0, 1.0);
  return a + ab * t;
}

@compute @workgroup_size(64)
fn fused_move(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= params.count) { return; }

  let p = positionsIn[i];
  let v = velocitiesIn[i];
  let freeSpeed = select(params.desiredSpeed, speed[i], speed[i] > 0.0);

  let toTarget = targets[i] - p;
  let distance = length(toTarget);
  // ADR-0033: the walking direction is the host-routed heading, NOT
  // normalize(target - position) — see this file's own doc comment above
  // the kernel string for why those are deliberately decoupled.
  let desired = routedHeading[i];
  // Stage 6: crowdMovement.ts's own two-part integration (this file's own
  // doc comment below the kernel string has the full citation) — desired
  // speed eases with distance to target (even for non-holding agents, a
  // real discrepancy from stages 1-5's flat freeSpeed target discovered
  // while scoping this stage), holding agents ease over holdEaseMeters
  // instead. force here accumulates PUSHES ONLY (everything except
  // relaxation) — relaxation is applied as an exact closed-form decay at
  // the very end, not folded into this sum.
  let isHolding = holding[i] != 0u;
  var desiredSpeed = min(freeSpeed, distance / params.relaxationTime);
  if (isHolding) {
    desiredSpeed = min(freeSpeed, (freeSpeed * distance) / params.holdEaseMeters);
  }
  var force = vec2<f32>(0.0, 0.0);

  // agent repulsion over the sorted 3x3 neighborhood — exponential falloff,
  // anisotropic (weighted less from behind), plus a contact term once bodies
  // overlap. Ports gpuSimCoreSocialForce.ts's agentForce() exactly. Also
  // counts strangersClose (formation force's crowding gate) in the same
  // pass, exactly like the CPU's own single loop does.
  let myGroup = groupIds[i];
  var strangersClose = 0u;
  let cell = cellOf(p);
  let cu = i32(cell % params.columns);
  let ru = i32(cell / params.columns);
  for (var dr = -1; dr <= 1; dr = dr + 1) {
    let nr = ru + dr;
    if (nr < 0 || nr >= i32(params.rows)) { continue; }
    for (var dc = -1; dc <= 1; dc = dc + 1) {
      let nc = cu + dc;
      if (nc < 0 || nc >= i32(params.columns)) { continue; }
      let ncell = u32(nr) * params.columns + u32(nc);
      let start = cellOffsets[ncell];
      let end = cellOffsets[ncell + 1u];
      for (var slot = start; slot < end; slot = slot + 1u) {
        let other = sortedAgentIds[slot];
        if (other == i) { continue; }
        let d = p - positionsIn[other];
        let dist = max(length(d), 0.0001);
        if (dist < params.interactionRangeMeters) {
          if (dist < formationRoomMeters && groupIds[other] != myGroup) {
            strangersClose = strangersClose + 1u;
          }
          let together = myGroup >= 0 && groupIds[other] == myGroup;
          let n = d / dist;
          let facing = -(desired.x * n.x + desired.y * n.y);
          let weight = params.anisotropy + (1.0 - params.anisotropy) * ((1.0 + facing) / 2.0);
          let bodies = radii[i] + radii[other];
          var push = 0.0;
          if (!together) {
            push = params.agentRepulsionStrength *
              exp((bodies - dist) / params.agentRepulsionRange) * weight;
          }
          if (dist < bodies) {
            push = push + params.contactStiffness * (bodies - dist);
          }
          force = force + n * push;
          if (!together && facing > params.sidestepCone) {
            let side = n.x * desired.y - n.y * desired.x;
            var away = 1.0;
            if (side > 0.05) { away = -1.0; }
            force.x = force.x + push * params.sidestep * away * -desired.y;
            force.y = force.y + push * params.sidestep * away * desired.x;
          }
        }
      }
    }
  }

  // anticipation (Karamouzas/Skinner/Guy time-to-collision push) — a
  // SEPARATE pass over the same 3x3 neighbourhood, its own range
  // (anticipationRangeMeters) and its own geometric test, exactly like the
  // CPU original calls anticipation() as its own function.
  var antX = 0.0;
  var antY = 0.0;
  for (var dr2 = -1; dr2 <= 1; dr2 = dr2 + 1) {
    let nr2 = ru + dr2;
    if (nr2 < 0 || nr2 >= i32(params.rows)) { continue; }
    for (var dc2 = -1; dc2 <= 1; dc2 = dc2 + 1) {
      let nc2 = cu + dc2;
      if (nc2 < 0 || nc2 >= i32(params.columns)) { continue; }
      let ncell2 = u32(nr2) * params.columns + u32(nc2);
      let start2 = cellOffsets[ncell2];
      let end2 = cellOffsets[ncell2 + 1u];
      for (var slot2 = start2; slot2 < end2; slot2 = slot2 + 1u) {
        let other2 = sortedAgentIds[slot2];
        if (other2 == i) { continue; }
        let w2 = positionsIn[other2] - p;
        let distSq2 = dot(w2, w2);
        if (distSq2 > params.anticipationRangeMeters * params.anticipationRangeMeters) { continue; }
        let rv = v - velocitiesIn[other2];
        let b2 = dot(w2, rv);
        if (b2 <= 0.0) { continue; }
        let bodies2 = radii[i] + radii[other2];
        let c2 = distSq2 - bodies2 * bodies2;
        if (c2 <= 0.0) { continue; }
        let a2 = dot(rv, rv);
        let disc = b2 * b2 - a2 * c2;
        if (a2 < 0.000001 || disc <= 0.0) { continue; }
        let root2 = sqrt(disc);
        let tau = (b2 - root2) / a2;
        if (tau <= 0.0) { continue; }
        let scale2 = (-params.anticipationStrength * exp(-tau / params.anticipationHorizonSeconds) *
          (2.0 / tau + 1.0 / params.anticipationHorizonSeconds)) / (a2 * tau * tau);
        antX = antX + scale2 * (rv.x - (b2 * rv.x - a2 * w2.x) / root2);
        antY = antY + scale2 * (rv.y - (b2 * rv.y - a2 * w2.y) / root2);
      }
    }
  }
  let antLen = length(vec2<f32>(antX, antY));
  if (antLen > params.anticipationMaxAcceleration && antLen > 0.0001) {
    let antScale = params.anticipationMaxAcceleration / antLen;
    antX = antX * antScale;
    antY = antY * antScale;
  }
  // ADR-0033: crowdMovement.ts skips anticipation entirely for a holding
  // agent (anticipating AND not holding is its own condition for the whole
  // computation) — a real discrepancy this kernel had since stage 4,
  // disclosed at the time as an accepted gap tied to holding not yet
  // existing as a concept (stage 6 introduced it but never revisited this).
  // The loop above still runs (recompute-then-discard, not skip — cheaper
  // than branching a whole neighbourhood loop per invocation, and
  // observably identical since nothing else reads antX/Y).
  if (!isHolding) {
    force.x = force.x + antX;
    force.y = force.y + antY;
  }

  // wall repulsion, and wallClose (formation force's other gate: the crowd
  // falls into single file near a wall instead of holding a side-by-side
  // line). Both use the same one-metre reach as the CPU original;
  // wallRepulsionRange here is only the push's decay length.
  var wallClose = false;
  let myRadius = radii[i];
  for (var w = 0u; w < params.wallCount; w = w + 1u) {
    let closest = closestOnSegment(p, walls[w]);
    let d = p - closest;
    let gap = length(d);
    // crowdMovement.ts skips a wall that is degenerate or further than a
    // metre, and otherwise pushes exponentially in the gap between the wall
    // and the body, plus contact stiffness once they touch.
    if (gap < 0.000000001 || gap > 1.0) { continue; }
    if (gap < formationRoomMeters) { wallClose = true; }
    var wallPush = params.wallRepulsionStrength *
      exp((myRadius - gap) / params.wallRepulsionRange);
    if (gap < myRadius) {
      wallPush = wallPush + params.contactStiffness * (myRadius - gap);
    }
    force = force + (d / gap) * wallPush;
  }

  // in-formation spring: pull toward the precomputed slot unless a wall is
  // close or two-plus strangers are. formationSlots is meaningless (never
  // read) for agents with no group.
  // -1.0e30 is noFormationSlot in gpuSimCoreSocialForce.ts: in a group, but
  // no slot this tick, so no pull (the group id still stops groupmates
  // repelling each other above).
  if (myGroup >= 0 && formationSlots[i].x > -5.0e29 && !wallClose && strangersClose < 2u) {
    force = force + formationGain * (formationSlots[i] - p);
  }

  // ADR-0033: crowdMovement.ts also skips hazard avoidance entirely for a
  // holding agent — same reasoning as anticipation above.
  if (!isHolding) {
    force = force + hazardAvoidance[i];
  }

  // Stage 6: pushes Euler-integrated into velocity first, then relaxation
  // toward (desired * desiredSpeed) solved exactly as a linear ODE over dt
  // — the closed-form v(dt) = target + (v0 - target) * e^(-dt/tau), which
  // cannot overshoot the target velocity at any step length. Ports
  // gpuSimCoreSocialForce.ts's integrateWithRelaxation() exactly.
  let relax = exp(-params.dt / params.relaxationTime);
  let targetV = desired * desiredSpeed;
  var cv = targetV + (v + force * params.dt - targetV) * relax;
  // Stage 7: zero only the along-heading component when it points
  // backward, never for a holding agent. Ports
  // gpuSimCoreSocialForce.ts's integrateWithRelaxation() exactly.
  if (!isHolding) {
    let along = cv.x * desired.x + cv.y * desired.y;
    if (along < 0.0) {
      cv = cv - along * desired;
    }
  }
  // freeSpeed * maxSpeedRatio is the real, per-agent clamp — NOT
  // params.maxSpeed (stages 1-5's flat clamp, unused by this integration).
  let len = length(cv);
  let maxSpeed = freeSpeed * params.maxSpeedRatio;
  if (len > maxSpeed && len > 0.0001) { cv = (cv / len) * maxSpeed; }
  // Stage 8: never walk past the target within one step. Ports
  // gpuSimCoreSocialForce.ts's integrateWithRelaxation() exactly — uses the
  // already-clamped speed, not the pre-maxSpeedRatio one.
  let speed = length(cv);
  if (!isHolding && speed * params.dt > distance && speed > 0.0) {
    let overshootScale = distance / (speed * params.dt);
    cv = cv * overshootScale;
  }
  velocitiesOut[i] = cv;
  positionsOut[i] = p + cv * params.dt;
}`;
