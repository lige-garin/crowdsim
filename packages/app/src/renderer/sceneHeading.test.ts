import { describe, expect, it } from "vitest";
import { Object3D, Vector3 } from "three";
import { sceneHeadingToRenderRotationZ } from "./sceneHeading";

/**
 * Not a screenshot: a headless check of the actual library behaviour this
 * formula depends on. `Object3D`/`Vector3` are pure math, no WebGL/canvas
 * needed — this runs the real `three.js` rotation code the renderer uses,
 * rather than trusting a by-hand derivation of what `rotation.z` does to a
 * local `+x`-facing object.
 */
function renderedFacingDirection(headingRadians: number): { x: number; y: number } {
  const object = new Object3D();
  object.rotation.z = sceneHeadingToRenderRotationZ(headingRadians);
  object.updateMatrix();
  const facing = new Vector3(1, 0, 0).applyMatrix4(object.matrix);
  return { x: facing.x, y: facing.y };
}

describe("sceneHeadingToRenderRotationZ", () => {
  it("heading toward scene +x renders facing +x — no rotation needed either way", () => {
    const facing = renderedFacingDirection(0);
    expect(facing.x).toBeCloseTo(1);
    expect(facing.y).toBeCloseTo(0);
  });

  it("heading toward scene +y renders facing -y (agentWorldPosition negates scene y)", () => {
    const facing = renderedFacingDirection(Math.PI / 2);
    expect(facing.x).toBeCloseTo(0);
    expect(facing.y).toBeCloseTo(-1);
  });

  it("heading toward scene -x renders facing -x", () => {
    const facing = renderedFacingDirection(Math.PI);
    expect(facing.x).toBeCloseTo(-1);
    expect(facing.y).toBeCloseTo(0);
  });

  it("heading toward scene -y renders facing +y", () => {
    const facing = renderedFacingDirection(-Math.PI / 2);
    expect(facing.x).toBeCloseTo(0);
    expect(facing.y).toBeCloseTo(1);
  });
});
