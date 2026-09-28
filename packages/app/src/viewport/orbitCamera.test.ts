import { Plane, PerspectiveCamera, Raycaster, Vector2, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  panByDrag,
  panByKeys,
  orbitByDrag,
  zoomByWheel,
  orbitToPosition,
  CITY_CAMERA_FOV_DEGREES,
  POLAR_MIN,
  POLAR_MAX,
  RADIUS_MIN,
  RADIUS_MAX,
  type OrbitState,
} from "./orbitCamera";

const base: OrbitState = { azimuth: 0, polar: Math.PI / 4, radius: 100 };

describe("orbitByDrag", () => {
  it("rotates the azimuth horizontally and keeps the radius", () => {
    const next = orbitByDrag(base, 100, 0);
    expect(next.azimuth).not.toBe(base.azimuth);
    expect(next.radius).toBe(base.radius);
  });

  it("clamps the polar angle into the 2.5D tilt range", () => {
    const wayUp = orbitByDrag(base, 0, -100000);
    const wayDown = orbitByDrag(base, 0, 100000);
    expect(wayUp.polar).toBeLessThanOrEqual(POLAR_MAX);
    expect(wayUp.polar).toBeGreaterThanOrEqual(POLAR_MIN);
    expect(wayDown.polar).toBeLessThanOrEqual(POLAR_MAX);
    expect(wayDown.polar).toBeGreaterThanOrEqual(POLAR_MIN);
  });
});

describe("zoomByWheel", () => {
  it("scrolling down (positive deltaY) zooms out, up zooms in", () => {
    const out = zoomByWheel(base, 240);
    const inn = zoomByWheel(base, -240);
    expect(out.radius).toBeGreaterThan(base.radius);
    expect(inn.radius).toBeLessThan(base.radius);
  });

  it("clamps the radius to the allowed range", () => {
    expect(zoomByWheel(base, 1e9).radius).toBeLessThanOrEqual(RADIUS_MAX);
    expect(zoomByWheel(base, -1e9).radius).toBeGreaterThanOrEqual(RADIUS_MIN);
  });
});

describe("orbitToPosition", () => {
  it("places the camera on the ground plane when polar is horizontal", () => {
    const pos = orbitToPosition({ azimuth: 0, polar: Math.PI / 2, radius: 50 });
    expect(pos.z).toBeCloseTo(0, 6);
    expect(pos.x).toBeCloseTo(50, 6);
  });

  it("offsets from a non-origin look-at target", () => {
    const target = { x: 10, y: -5, z: 2 };
    const pos = orbitToPosition({ azimuth: 0, polar: Math.PI / 2, radius: 30 }, target);
    expect(pos.z).toBeCloseTo(target.z, 6);
    expect(pos.x).toBeCloseTo(target.x + 30, 6);
  });
});

describe("panning the city", () => {
  // Camera on the -y side of the target, looking toward +y.
  const facingNorth: OrbitState = {
    azimuth: -Math.PI / 2,
    polar: Math.PI / 4,
    radius: 100,
  };
  const origin = { x: 0, y: 0 };

  it("moves forward along the camera heading when dragging up the screen", () => {
    const next = panByDrag(origin, facingNorth, 0, 100, 800);
    expect(next.y).toBeGreaterThan(0);
    expect(Math.abs(next.x)).toBeLessThan(1e-6);
  });

  it("moves the city with the cursor when dragging sideways", () => {
    // Facing +y, screen-right is +x. Grabbing the ground and dragging right
    // must carry the city right, so the camera's target moves left.
    const next = panByDrag(origin, facingNorth, 100, 0, 800);
    expect(next.x).toBeLessThan(0);
  });

  it("pans right with the right key", () => {
    const next = panByKeys(
      origin,
      facingNorth,
      { back: false, forward: false, left: false, right: true },
      0.5,
    );
    expect(next.x).toBeGreaterThan(0);
  });

  it("agrees with the real camera about which way is screen-right", () => {
    // Project a point just to the target's screen-right and check it lands
    // on the right half of the image, for a heading that is not axis-aligned.
    const state: OrbitState = { azimuth: 2.2, polar: 0.8, radius: 120 };
    const eye = orbitToPosition(state);
    const camera = new PerspectiveCamera(40, 1.6, 0.5, 2000);
    camera.up.set(0, 0, 1);
    camera.position.set(eye.x, eye.y, eye.z);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    // Keys "right" moves the target toward screen-right.
    const step = panByKeys(
      origin,
      state,
      { back: false, forward: false, left: false, right: true },
      0.1,
    );
    const projected = new Vector3(step.x, step.y, 0).project(camera);
    expect(projected.x).toBeGreaterThan(0);
    expect(Math.abs(projected.y)).toBeLessThan(Math.abs(projected.x));
  });

  it("keeps the ground you grabbed under the pointer", () => {
    const state: OrbitState = {
      azimuth: 2.2,
      polar: (44 * Math.PI) / 180,
      radius: 210,
    };
    const width = 1600;
    const height = 900;
    const cameraFor = (target: { x: number; y: number }) => {
      const eye = orbitToPosition(state, { ...target, z: 0 });
      const camera = new PerspectiveCamera(
        CITY_CAMERA_FOV_DEGREES,
        width / height,
        0.5,
        2600,
      );
      camera.up.set(0, 0, 1);
      camera.position.set(eye.x, eye.y, eye.z);
      camera.lookAt(target.x, target.y, 0);
      camera.updateMatrixWorld();
      return camera;
    };
    const groundAt = (camera: PerspectiveCamera, px: number, py: number) => {
      const ray = new Raycaster();
      ray.setFromCamera(
        new Vector2((px / width) * 2 - 1, -((py / height) * 2 - 1)),
        camera,
      );
      return ray.ray.intersectPlane(new Plane(new Vector3(0, 0, 1), 0), new Vector3())!;
    };
    const start = { x: width / 2 - 60, y: height / 2 + 40 };
    const end = { x: width / 2 + 60, y: height / 2 - 40 };
    const grabbed = groundAt(cameraFor(origin), start.x, start.y);

    const next = panByDrag(origin, state, end.x - start.x, end.y - start.y, height);
    const onScreen = grabbed.clone().project(cameraFor(next));
    const px = ((onScreen.x + 1) / 2) * width;
    const py = ((1 - onScreen.y) / 2) * height;

    expect(Math.abs(px - end.x)).toBeLessThan(15);
    expect(Math.abs(py - end.y)).toBeLessThan(15);
  });

  it("strafes perpendicular to the heading when dragging sideways", () => {
    const next = panByDrag(origin, facingNorth, 100, 0, 800);
    expect(Math.abs(next.x)).toBeGreaterThan(0);
    expect(Math.abs(next.y)).toBeLessThan(1e-6);
  });

  it("covers more ground per pixel when zoomed out", () => {
    const near = panByDrag(origin, { ...facingNorth, radius: 20 }, 0, 100, 800);
    const far = panByDrag(origin, { ...facingNorth, radius: 400 }, 0, 100, 800);
    expect(Math.abs(far.y)).toBeGreaterThan(Math.abs(near.y) * 10);
  });

  it("never leaves the city bounds", () => {
    const limit = { maxX: 50, maxY: 50, minX: -50, minY: -50 };
    const next = panByDrag(origin, facingNorth, 0, 1e7, 800, limit);
    expect(next.y).toBeLessThanOrEqual(50);
  });

  it("drives the same heading from the keyboard", () => {
    const next = panByKeys(
      origin,
      facingNorth,
      { back: false, forward: true, left: false, right: false },
      0.5,
    );
    expect(next.y).toBeGreaterThan(0);
  });
});
