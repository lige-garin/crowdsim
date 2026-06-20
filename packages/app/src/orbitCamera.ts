export type OrbitState = {
  /** Horizontal angle around the up(z) axis, radians. */
  azimuth: number;
  /** Polar angle from the up(z) axis, radians; clamped to keep a 2.5D tilt. */
  polar: number;
  /** Distance from the look-at target. */
  radius: number;
};

export type Vec3 = { x: number; y: number; z: number };

/** Tilt limits keep the map-like 2.5D framing (never under the ground, never straight down). */
export const POLAR_MIN = (15 * Math.PI) / 180;
export const POLAR_MAX = (80 * Math.PI) / 180;
/** Zoom limits in world units (metres). */
export const RADIUS_MIN = 20;
export const RADIUS_MAX = 200;

const ORBIT_SPEED = 0.005; // radians per dragged pixel
const ZOOM_SPEED = 0.0015; // per wheel delta unit

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/** Pointer drag delta (pixels) -> new orbit. Dragging right spins the city left. */
export function orbitByDrag(
  state: OrbitState,
  dxPixels: number,
  dyPixels: number,
): OrbitState {
  return {
    azimuth: state.azimuth - dxPixels * ORBIT_SPEED,
    polar: clamp(state.polar - dyPixels * ORBIT_SPEED, POLAR_MIN, POLAR_MAX),
    radius: state.radius,
  };
}

/** Wheel delta -> new radius. Scrolling down (positive deltaY) zooms out. */
export function zoomByWheel(state: OrbitState, deltaY: number): OrbitState {
  return {
    ...state,
    radius: clamp(state.radius * Math.exp(deltaY * ZOOM_SPEED), RADIUS_MIN, RADIUS_MAX),
  };
}

/** Orbit (z-up spherical) -> camera position offset from the look-at target. */
export function orbitToPosition(
  state: OrbitState,
  target: Vec3 = { x: 0, y: 0, z: 0 },
): Vec3 {
  const sinPolar = Math.sin(state.polar);
  return {
    x: target.x + state.radius * sinPolar * Math.cos(state.azimuth),
    y: target.y + state.radius * sinPolar * Math.sin(state.azimuth),
    z: target.z + state.radius * Math.cos(state.polar),
  };
}

/** Inverse of orbitToPosition — seeds orbit state from the initial camera position. */
export function positionToOrbit(pos: Vec3, target: Vec3 = { x: 0, y: 0, z: 0 }): OrbitState {
  const dx = pos.x - target.x;
  const dy = pos.y - target.y;
  const dz = pos.z - target.z;
  const radius = Math.hypot(dx, dy, dz);
  return {
    azimuth: Math.atan2(dy, dx),
    polar: Math.acos(clamp(dz / (radius || 1), -1, 1)),
    radius,
  };
}
