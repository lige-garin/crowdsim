import {
  CanvasTexture,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from "three";

/**
 * A soft dark patch under each person.
 *
 * The sun's shadow map spreads 4096 texels over the whole district, about 12 cm
 * each: buildings cast fine shadows, but a person's is a smudge or nothing, so
 * the crowd looked pasted onto the ground. Games solve this with a blob shadow
 * under every character, and so does this — one instanced quad for everyone,
 * a radial falloff texture, stretched a little along the direction of travel.
 */
const FOOTPRINT_METERS = 0.62;
const OPACITY = 0.5;

export function createContactShadows(capacity: number) {
  const texture = falloffTexture();
  if (!texture) return undefined;

  const geometry = new PlaneGeometry(1, 1);
  const material = new MeshBasicMaterial({
    color: "#000000",
    depthWrite: false,
    map: texture,
    opacity: OPACITY,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    transparent: true,
  });
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.name = "crowd-contact-shadows";
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.count = 0;
  mesh.renderOrder = 1;

  const matrix = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const up = new Vector3(0, 0, 1);
  let count = 0;
  let previousCount = 0;

  return {
    /** Start a frame. */
    begin() {
      count = 0;
    },
    /** One person at render (x, y), facing `heading`, drawn `size` times life size. */
    add(x: number, y: number, heading: number, size: number) {
      if (count >= capacity) return;
      position.set(x, y, 0.03);
      rotation.setFromAxisAngle(up, heading);
      scale.set(FOOTPRINT_METERS * size * 1.25, FOOTPRINT_METERS * size, 1);
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(count++, matrix);
    },
    /** Finish a frame and upload what changed. */
    end() {
      const touched = Math.max(count, previousCount);
      mesh.count = count;
      previousCount = count;
      if (touched > 0) {
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0, touched * 16);
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      texture.dispose();
      mesh.dispose();
    },
    mesh,
  };
}

/** White with alpha falling off from the centre; null where there is no 2D canvas. */
function falloffTexture() {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;
  const size = 64;
  canvas.width = size;
  canvas.height = size;
  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.45, "rgba(255,255,255,0.75)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}
