import {
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from "three";
import { mulberry32 } from "./simulationEngineRandom";

/**
 * Rain that falls.
 *
 * The 3D view drew at most 26 thin cylinders for the whole district, placed by
 * index with no time term and rebuilt every five simulated seconds, so the rain
 * hung motionless in the air. This is one instanced mesh of streaks spread over
 * the district, each falling and drifting with the wind every frame and
 * wrapping back to the top, so it reads as weather rather than a decoration.
 *
 * The object carries `userData.tick(dtSeconds)`, which the render loop calls.
 */
type RainFieldOptions = {
  /** Area the rain covers, in render space (z up). */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** 0..1 precipitation. */
  intensity: number;
  /** Wind in render space, m/s. */
  wind: { x: number; y: number };
  /** Layer object name, so the weather toggle finds it. */
  name: string;
  seed?: number;
};

/** Streaks per square metre at full intensity. */
const STREAK_DENSITY = 0.12;
const MAX_STREAKS = 4000;
const CEILING_METERS = 26;
const FALL_SPEED = 9;

export function createRainField(options: RainFieldOptions) {
  const width = options.bounds.maxX - options.bounds.minX;
  const depth = options.bounds.maxY - options.bounds.minY;
  const count = Math.min(
    MAX_STREAKS,
    Math.round(
      width * depth * STREAK_DENSITY * Math.max(0, Math.min(1, options.intensity)),
    ),
  );
  const length = 0.9 + options.intensity * 0.6;
  const geometry = new CylinderGeometry(0.012, 0.012, length, 3, 1, true);
  const material = new MeshBasicMaterial({
    color: "#d6e6ee",
    depthWrite: false,
    opacity: 0.18 + options.intensity * 0.22,
    transparent: true,
  });
  const mesh = new InstancedMesh(geometry, material, Math.max(1, count));
  mesh.name = options.name;
  mesh.count = count;
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);

  const random = mulberry32(options.seed ?? 1);
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) {
    positions[index * 3] = options.bounds.minX + random() * width;
    positions[index * 3 + 1] = options.bounds.minY + random() * depth;
    positions[index * 3 + 2] = random() * CEILING_METERS;
  }

  // Streaks lean into the wind: a cylinder's axis is y, tipped to the fall line.
  const fall = new Vector3(options.wind.x, options.wind.y, -FALL_SPEED);
  const tilt = new Quaternion().setFromUnitVectors(
    new Vector3(0, 1, 0),
    fall.clone().normalize(),
  );
  const matrix = new Matrix4();
  const position = new Vector3();
  const unit = new Vector3(1, 1, 1);

  function tick(dtSeconds: number) {
    const dt = Math.min(0.1, Math.max(0, dtSeconds));
    for (let index = 0; index < count; index++) {
      let x = positions[index * 3] + options.wind.x * dt;
      let y = positions[index * 3 + 1] + options.wind.y * dt;
      let z = positions[index * 3 + 2] - FALL_SPEED * dt;
      if (z < 0) {
        z += CEILING_METERS;
        x = options.bounds.minX + random() * width;
        y = options.bounds.minY + random() * depth;
      }
      if (x < options.bounds.minX) x += width;
      else if (x > options.bounds.maxX) x -= width;
      if (y < options.bounds.minY) y += depth;
      else if (y > options.bounds.maxY) y -= depth;
      positions[index * 3] = x;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = z;
      matrix.compose(position.set(x, y, z + length / 2), tilt, unit);
      mesh.setMatrixAt(index, matrix);
    }
    if (count > 0) mesh.instanceMatrix.needsUpdate = true;
  }

  tick(0);
  mesh.userData.tick = tick;
  return mesh;
}
