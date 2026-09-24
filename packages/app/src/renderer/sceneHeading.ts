/**
 * A scene-space heading (`atan2`, 0 = scene +x) to the `rotation.z` a
 * renderer applies so an object whose default (unrotated) facing is +x in
 * its own local space — the vehicle box, the crosswalk stripe — points the
 * right way in render space.
 *
 * The negation: `agentWorldPosition` maps scene y to render y negated
 * (`height/2 - y`) while scene x maps to render x unchanged, so a scene
 * direction vector `(dx, dy)` becomes `(dx, -dy)` in render space —
 * `atan2(-dy, dx) === -atan2(dy, dx)`. Scene x stays render x, so heading 0
 * needs no rotation either way, which this formula also gives (`-0 === 0`).
 */
export function sceneHeadingToRenderRotationZ(headingRadians: number): number {
  return -headingRadians;
}
