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
  let ds = select(params.desiredSpeed, speed[i], speed[i] > 0.0);

  let toTarget = targets[i] - p;
  let tlen = length(toTarget);
  var desired = vec2<f32>(0.0, 0.0);
  if (tlen > 0.0001) { desired = toTarget / tlen; }
  var force = (desired * ds - v) / params.relaxationTime;

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

  // wall repulsion, and wallClose (formation force's other gate: the crowd
  // falls into single file near a wall instead of holding a side-by-side
  // line) — a different, wider radius (formationRoomMeters) than the push
  // itself (wallRepulsionRange), same as the CPU original.
  var wallClose = false;
  for (var w = 0u; w < params.wallCount; w = w + 1u) {
    let closest = closestOnSegment(p, walls[w]);
    let d = p - closest;
    let dist = max(length(d), 0.0001);
    if (dist > 0.000001 && dist < formationRoomMeters) { wallClose = true; }
    if (dist < params.wallRepulsionRange) {
      let strength = params.wallRepulsionStrength *
        ((params.wallRepulsionRange - dist) / params.wallRepulsionRange);
      force = force + (d / dist) * strength;
    }
  }

  // in-formation spring: pull toward the precomputed slot unless a wall is
  // close or two-plus strangers are. formationSlots is meaningless (never
  // read) for agents with no group.
  if (myGroup >= 0 && !wallClose && strangersClose < 2u) {
    force = force + formationGain * (formationSlots[i] - p);
  }

  // integrate + clamp to maxSpeed
  let uv = v + force * params.dt;
  let len = length(uv);
  var cv = uv;
  if (len > params.maxSpeed && len > 0.0001) { cv = (uv / len) * params.maxSpeed; }
  velocitiesOut[i] = cv;
  positionsOut[i] = p + cv * params.dt;
}`;
