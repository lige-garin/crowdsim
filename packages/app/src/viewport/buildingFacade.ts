import { clamp } from "../numberUtils";

export type FacadeWindow = {
  /** Horizontal centre offset from the facade midline, world units. */
  offset: number;
  /** Vertical centre above the building base, world units. */
  vertical: number;
  width: number;
  height: number;
};

/**
 * Lays out a grid of windows over one building facade so the 3d city reads as
 * real buildings rather than flat coloured blocks. Window count scales with the
 * facade size; every window stays inside the facade rectangle (with a margin so
 * panes do not touch the edges).
 */
export function facadeWindows(
  facadeWidth: number,
  buildingHeight: number,
): FacadeWindow[] {
  if (facadeWidth <= 0 || buildingHeight <= 0) {
    return [];
  }

  const cols = clamp(Math.floor(facadeWidth / 3.2), 1, 6);
  const rows = clamp(Math.floor(buildingHeight / 1.0), 1, 5);
  const cellWidth = facadeWidth / cols;
  const cellHeight = buildingHeight / rows;
  const windowWidth = cellWidth * 0.5;
  const windowHeight = cellHeight * 0.5;

  const windows: FacadeWindow[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      windows.push({
        offset: (col + 0.5) * cellWidth - facadeWidth / 2,
        vertical: (row + 0.5) * cellHeight,
        width: windowWidth,
        height: windowHeight,
      });
    }
  }

  return windows;
}
