export type Rect = { left: number; top: number; width: number; height: number };

/** Client/screen coords -> WebGL normalized device coords ([-1,1], y axis up). */
export function screenToNdc(
  clientX: number,
  clientY: number,
  rect: Rect,
): { x: number; y: number } {
  return {
    x: ((clientX - rect.left) / rect.width) * 2 - 1,
    y: -(((clientY - rect.top) / rect.height) * 2 - 1),
  };
}

/**
 * A pointer gesture is a click (select) rather than a drag (orbit) when the
 * pointer barely moved between down and up.
 */
export function isClick(deltaX: number, deltaY: number, threshold = 6): boolean {
  return Math.hypot(deltaX, deltaY) <= threshold;
}
