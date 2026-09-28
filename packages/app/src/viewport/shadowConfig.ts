export type ShadowFrustum = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
  mapSize: number;
};

/**
 * Orthographic shadow-camera frustum for the directional key light, sized so
 * the whole world footprint casts/receives shadows. Centred on the origin (the
 * scene is centred there), with a margin so buildings near the edge are not
 * clipped out of the shadow map.
 */
export function shadowCameraFrustum(
  worldWidth: number,
  worldHeight: number,
): ShadowFrustum {
  const radius = Math.hypot(worldWidth, worldHeight) / 2;
  const span = radius * 1.15;

  return {
    left: -span,
    right: span,
    top: span,
    bottom: -span,
    near: 1,
    far: radius * 4 + worldHeight,
    // 4096² over a ~500 m frustum is ~12 cm a texel: enough for a building,
    // not for a person, which is why people also get contact shadows.
    mapSize: 4096,
  };
}
