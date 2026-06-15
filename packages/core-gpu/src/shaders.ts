export const densityAccumulatorShader = `
@group(0) @binding(0) var<storage, read> params: array<u32>;
@group(0) @binding(1) var<storage, read> positions: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> cellCounts: array<atomic<u32>>;

fn agent_count() -> u32 {
  return params[0];
}

fn columns() -> u32 {
  return params[1];
}

fn rows() -> u32 {
  return params[2];
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
fn accumulate_density(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x;

  if (index >= agent_count()) {
    return;
  }

  atomicAdd(&cellCounts[cell_id_for(positions[index])], 1u);
}
`;

export const spatialHashGridShader = `
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
`;

export const socialForceShader = `
@group(0) @binding(0) var<storage, read> paramsU32: array<u32>;
@group(0) @binding(1) var<storage, read> paramsF32: array<f32>;
@group(0) @binding(2) var<storage, read> positionsIn: array<vec2<f32>>;
@group(0) @binding(3) var<storage, read> velocitiesIn: array<vec2<f32>>;
@group(0) @binding(4) var<storage, read> targets: array<vec2<f32>>;
@group(0) @binding(5) var<storage, read> walls: array<vec4<f32>>;
@group(0) @binding(6) var<storage, read_write> positionsOut: array<vec2<f32>>;
@group(0) @binding(7) var<storage, read_write> velocitiesOut: array<vec2<f32>>;

fn agent_count() -> u32 {
  return paramsU32[0];
}

fn wall_count() -> u32 {
  return paramsU32[1];
}

fn dt() -> f32 {
  return paramsF32[0];
}

fn desired_speed() -> f32 {
  return paramsF32[1];
}

fn relaxation_time() -> f32 {
  return paramsF32[2];
}

fn agent_repulsion_strength() -> f32 {
  return paramsF32[3];
}

fn agent_repulsion_range() -> f32 {
  return paramsF32[4];
}

fn wall_repulsion_strength() -> f32 {
  return paramsF32[5];
}

fn wall_repulsion_range() -> f32 {
  return paramsF32[6];
}

fn max_speed() -> f32 {
  return paramsF32[7];
}

fn safe_normalize(value: vec2<f32>) -> vec2<f32> {
  let lengthValue = length(value);
  if (lengthValue <= 0.0001) {
    return vec2<f32>(0.0, 0.0);
  }
  return value / lengthValue;
}

fn clamp_magnitude(value: vec2<f32>, maxLength: f32) -> vec2<f32> {
  let lengthValue = length(value);
  if (lengthValue <= maxLength || lengthValue <= 0.0001) {
    return value;
  }
  return safe_normalize(value) * maxLength;
}

fn closest_point_on_segment(point: vec2<f32>, wall: vec4<f32>) -> vec2<f32> {
  let start = wall.xy;
  let end = wall.zw;
  let segment = end - start;
  let denominator = max(dot(segment, segment), 0.0001);
  let t = clamp(dot(point - start, segment) / denominator, 0.0, 1.0);
  return start + segment * t;
}

@compute @workgroup_size(64)
fn step_social_force(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x;
  if (index >= agent_count()) {
    return;
  }

  let position = positionsIn[index];
  let velocity = velocitiesIn[index];
  let desiredDirection = safe_normalize(targets[index] - position);
  var force = (desiredDirection * desired_speed() - velocity) / relaxation_time();

  for (var other = 0u; other < agent_count(); other = other + 1u) {
    if (other == index) {
      continue;
    }

    let delta = position - positionsIn[other];
    let distance = max(length(delta), 0.0001);
    if (distance < agent_repulsion_range()) {
      let strength = agent_repulsion_strength() *
        ((agent_repulsion_range() - distance) / agent_repulsion_range());
      force = force + safe_normalize(delta) * strength;
    }
  }

  for (var wallIndex = 0u; wallIndex < wall_count(); wallIndex = wallIndex + 1u) {
    let closest = closest_point_on_segment(position, walls[wallIndex]);
    let delta = position - closest;
    let distance = max(length(delta), 0.0001);
    if (distance < wall_repulsion_range()) {
      let strength = wall_repulsion_strength() *
        ((wall_repulsion_range() - distance) / wall_repulsion_range());
      force = force + safe_normalize(delta) * strength;
    }
  }

  let nextVelocity = clamp_magnitude(velocity + force * dt(), max_speed());
  velocitiesOut[index] = nextVelocity;
  positionsOut[index] = position + nextVelocity * dt();
}
`;

export const flowFieldSamplerShader = `
@group(0) @binding(0) var<storage, read> paramsU32: array<u32>;
@group(0) @binding(1) var<storage, read> paramsF32: array<f32>;
@group(0) @binding(2) var<storage, read> positions: array<vec2<f32>>;
@group(0) @binding(3) var flowField: texture_2d<f32>;
@group(0) @binding(4) var<storage, read_write> directionsOut: array<vec2<f32>>;

fn agent_count() -> u32 {
  return paramsU32[0];
}

fn columns() -> u32 {
  return paramsU32[1];
}

fn rows() -> u32 {
  return paramsU32[2];
}

fn cell_size() -> f32 {
  return paramsF32[0];
}

@compute @workgroup_size(64)
fn sample_flow_field(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x;
  if (index >= agent_count()) {
    return;
  }

  let position = positions[index];
  let column = min(u32(max(floor(position.x / cell_size()), 0.0)), columns() - 1u);
  let row = min(u32(max(floor(position.y / cell_size()), 0.0)), rows() - 1u);
  let sample = textureLoad(flowField, vec2<i32>(i32(column), i32(row)), 0);

  directionsOut[index] = sample.xy;
}
`;

export const neuralResidualShader = `
@group(0) @binding(0) var<storage, read> params: array<u32>;
@group(0) @binding(1) var<storage, read> features: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> weights: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> correctionsOut: array<vec2<f32>>;

fn sample_count() -> u32 {
  return params[0];
}

fn residual_limit() -> f32 {
  return weights[5].w;
}

fn clamp_residual(value: f32) -> f32 {
  return clamp(value, -residual_limit(), residual_limit());
}

@compute @workgroup_size(64)
fn infer_neural_residual(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x;
  if (index >= sample_count()) {
    return;
  }

  if (weights[6].z < 0.5) {
    correctionsOut[index] = vec2<f32>(0.0, 0.0);
    return;
  }

  let input = features[index];
  let hidden = vec3<f32>(
    tanh(dot(weights[0], input) + weights[5].x),
    tanh(dot(weights[1], input) + weights[5].y),
    tanh(dot(weights[2], input) + weights[5].z),
  );
  let speed = tanh(dot(weights[3].xyz, hidden) + weights[6].x);
  let throughput = tanh(dot(weights[4].xyz, hidden) + weights[6].y);

  correctionsOut[index] = vec2<f32>(
    clamp_residual(speed),
    clamp_residual(throughput),
  );
}
`;
