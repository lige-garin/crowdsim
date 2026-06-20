import { describe, expect, it } from "vitest";
import { shadowCameraFrustum } from "./shadowConfig";

describe("shadowCameraFrustum", () => {
  const f = shadowCameraFrustum(160, 96);

  it("is a valid orthographic frustum", () => {
    expect(f.left).toBeLessThan(f.right);
    expect(f.bottom).toBeLessThan(f.top);
    expect(f.near).toBeLessThan(f.far);
    expect(f.near).toBeGreaterThan(0);
  });

  it("covers the whole world footprint", () => {
    expect(f.right).toBeGreaterThanOrEqual(160 / 2);
    expect(f.top).toBeGreaterThanOrEqual(96 / 2);
  });

  it("is centred (symmetric) so the scene sits in the shadow camera", () => {
    expect(f.left).toBeCloseTo(-f.right, 9);
    expect(f.bottom).toBeCloseTo(-f.top, 9);
  });

  it("uses a positive power-of-two shadow map size", () => {
    expect(f.mapSize).toBeGreaterThan(0);
    expect(Number.isInteger(Math.log2(f.mapSize))).toBe(true);
  });

  it("scales the frustum with world size", () => {
    expect(shadowCameraFrustum(400, 400).right).toBeGreaterThan(f.right);
  });
});
