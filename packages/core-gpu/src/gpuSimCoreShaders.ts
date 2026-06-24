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
@group(0) @binding(3) var<storage, read> meta: array<u32>;           // [n]
var<workgroup> tile: array<u32, 256>;
@compute @workgroup_size(256)
fn scan_blocks(@builtin(global_invocation_id) gid: vec3<u32>,
               @builtin(local_invocation_id) lid: vec3<u32>,
               @builtin(workgroup_id) wid: vec3<u32>) {
  let n = meta[0];
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
  let n = meta[0];
  let i = gid.x;
  if (i >= n) { return; }
  var acc = 0u;
  for (var b = 0u; b < wid.x; b = b + 1u) { acc = acc + blockTotals[b]; }
  offsets[i] = offsets[i] + acc;
  if (i == n - 1u) { offsets[n] = offsets[i] + counts[i]; }
}`;
