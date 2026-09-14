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
/**
 * Zoom limits in world units (metres). The far limit takes in the whole
 * generated city around the district; the near limit is street level, close
 * enough to read individual people.
 */
export const RADIUS_MIN = 12;
export const RADIUS_MAX = 460;

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

export type GroundPoint = { x: number; y: number };

/** Vertical field of view of the city camera; the renderer builds it with this. */
export const CITY_CAMERA_FOV_DEGREES = 40;
const CITY_CAMERA_FOV_RADIANS = (CITY_CAMERA_FOV_DEGREES * Math.PI) / 180;

/**
 * Drag -> new look-at target, moving the city under the cursor the way a map
 * or a city builder does. The step scales with zoom so a drag covers the same
 * share of the screen whether you are at street level or over the skyline, and
 * it follows the camera's heading so "drag up" always means "go forward".
 */
export function panByDrag(
  target: GroundPoint,
  state: OrbitState,
  dxPixels: number,
  dyPixels: number,
  viewportHeightPixels: number,
  limit?: { maxX: number; maxY: number; minX: number; minY: number },
): GroundPoint {
  // Ground covered by one pixel at the target: the lens sees 2·tan(fov/2)·r of
  // height there. Across the screen that is exact; along it the ground is
  // foreshortened by the tilt. A flat 1.1·r made the city outrun the cursor by
  // about half again, so what you grabbed did not stay under the pointer.
  const across =
    (2 * Math.tan(CITY_CAMERA_FOV_RADIANS / 2) * state.radius) /
    Math.max(1, viewportHeightPixels);
  const along = across / Math.max(0.2, Math.cos(state.polar));
  // Camera sits at `azimuth` from the target, so forward is the opposite way.
  const forward = { x: -Math.cos(state.azimuth), y: -Math.sin(state.azimuth) };
  const right = screenRight(forward);
  const next = {
    x: target.x - right.x * dxPixels * across + forward.x * dyPixels * along,
    y: target.y - right.y * dxPixels * across + forward.y * dyPixels * along,
  };
  return limit ? clampPoint(next, limit) : next;
}

/** WASD / arrow keys -> target step, same heading rules as dragging. */
export function panByKeys(
  target: GroundPoint,
  state: OrbitState,
  keys: { back: boolean; forward: boolean; left: boolean; right: boolean },
  seconds: number,
  limit?: { maxX: number; maxY: number; minX: number; minY: number },
): GroundPoint {
  const speed = state.radius * 0.9 * seconds;
  const forward = { x: -Math.cos(state.azimuth), y: -Math.sin(state.azimuth) };
  const right = screenRight(forward);
  const f = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0);
  const r = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const next = {
    x: target.x + (forward.x * f + right.x * r) * speed,
    y: target.y + (forward.y * f + right.y * r) * speed,
  };
  return limit ? clampPoint(next, limit) : next;
}

/**
 * Screen-right on the ground for a camera looking along `forward` with z up:
 * forward × up. It was forward rotated the other way — screen-left — so a
 * sideways drag slid the city away from the cursor and D panned left.
 */
function screenRight(forward: GroundPoint): GroundPoint {
  return { x: forward.y, y: -forward.x };
}

function clampPoint(
  point: GroundPoint,
  limit: { maxX: number; maxY: number; minX: number; minY: number },
): GroundPoint {
  return {
    x: clamp(point.x, limit.minX, limit.maxX),
    y: clamp(point.y, limit.minY, limit.maxY),
  };
}
