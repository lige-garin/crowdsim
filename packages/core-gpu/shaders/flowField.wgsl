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
