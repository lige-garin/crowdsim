// Push overlapping city labels downward so they stay readable instead of piling
// up on the same spot (buildings/shops cluster in the scene centre).
export function deconflictLabels<
  T extends { leftPercent: number; topPercent: number },
>(labels: readonly T[]): T[] {
  const minDeltaX = 11;
  const minDeltaY = 3.4;
  const placed: T[] = [];

  for (const label of [...labels].sort((a, b) => a.topPercent - b.topPercent)) {
    let topPercent = label.topPercent;
    while (
      placed.some(
        (other) =>
          Math.abs(other.leftPercent - label.leftPercent) < minDeltaX &&
          Math.abs(other.topPercent - topPercent) < minDeltaY,
      )
    ) {
      topPercent += minDeltaY;
    }
    placed.push({ ...label, topPercent });
  }

  return placed;
}
