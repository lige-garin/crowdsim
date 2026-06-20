export type Placement = { x: number; y: number };

export type StreetDressing = {
  trees: Placement[];
  lights: Placement[];
};

/**
 * Places street trees and lights along the road points so the 3d scene reads as
 * a dressed street, not bare ground. Dresses every other point (so dressing
 * does not crowd dense polylines), with the tree and light on opposite sides.
 */
export function streetDressingPlacements(
  roadPoints: readonly Placement[],
): StreetDressing {
  const trees: Placement[] = [];
  const lights: Placement[] = [];

  roadPoints.forEach((point, index) => {
    if (index % 2 !== 0) {
      return;
    }
    trees.push({ x: point.x + 4, y: point.y + 5 });
    lights.push({ x: point.x - 5, y: point.y - 4 });
  });

  return { trees, lights };
}
