@group(0) @binding(0) var<storage, read> params: array<u32>;
@group(0) @binding(1) var<storage, read> positions: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> cellIds: array<u32>;
@group(0) @binding(3) var<storage, read_write> cellCounts: array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> cellOffsets: array<u32>;
@group(0) @binding(5) var<storage, read_write> sortedAgentIds: array<u32>;

fn agent_count() -> u32 {
  return params[0];
}

fn columns() -> u32 {
  return params[1];
}

fn rows() -> u32 {
  return params[2];
}

fn cell_count() -> u32 {
  return params[3];
}

fn cell_size() -> f32 {
  return bitcast<f32>(params[4]);
}

fn cell_id_for(position: vec2<f32>) -> u32 {
  let column = min(u32(max(floor(position.x / cell_size()), 0.0)), columns() - 1u);
  let row = min(u32(max(floor(position.y / cell_size()), 0.0)), rows() - 1u);
  return row * columns() + column;
}

@compute @workgroup_size(64)
fn hash_agents(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x;
  if (index >= agent_count()) {
    return;
  }

  let cellId = cell_id_for(positions[index]);
  cellIds[index] = cellId;
  _ = atomicAdd(&cellCounts[cellId], 1u);
}

@compute @workgroup_size(64)
fn sort_agents(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x;
  if (index >= agent_count()) {
    return;
  }

  let cellId = cellIds[index];
  var rank = 0u;

  for (var other = 0u; other < agent_count(); other = other + 1u) {
    let otherCell = cellIds[other];
    if (otherCell < cellId || (otherCell == cellId && other < index)) {
      rank = rank + 1u;
    }
  }

  sortedAgentIds[rank] = index;
}

@compute @workgroup_size(64)
fn build_offsets(@builtin(global_invocation_id) id: vec3<u32>) {
  let cell = id.x;
  if (cell > cell_count()) {
    return;
  }

  var offset = 0u;
  for (var index = 0u; index < cell; index = index + 1u) {
    offset = offset + atomicLoad(&cellCounts[index]);
  }
  cellOffsets[cell] = offset;
}
