import type {
  AgentSoA,
  SocialForceParams,
  SpatialHashGridLayout,
  WallSegment,
} from "./types";

export function computeCellId(
  x: number,
  y: number,
  layout: SpatialHashGridLayout,
): number {
  const column = clamp(Math.floor(x / layout.cellSize), 0, layout.columns - 1);
  const row = clamp(Math.floor(y / layout.cellSize), 0, layout.rows - 1);
  return row * layout.columns + column;
}

export function pointToCellId(
  x: number,
  y: number,
  layout: SpatialHashGridLayout,
): number {
  return computeCellId(x, y, layout);
}

export function cellCenter(
  cell: number,
  layout: SpatialHashGridLayout,
): { x: number; y: number } {
  const column = cell % layout.columns;
  const row = Math.floor(cell / layout.columns);

  return {
    x: (column + 0.5) * layout.cellSize,
    y: (row + 0.5) * layout.cellSize,
  };
}

export function neighborCellIds(cell: number, layout: SpatialHashGridLayout): number[] {
  const column = cell % layout.columns;
  const row = Math.floor(cell / layout.columns);
  const neighbors: number[] = [];

  if (column > 0) {
    neighbors.push(cell - 1);
  }

  if (column < layout.columns - 1) {
    neighbors.push(cell + 1);
  }

  if (row > 0) {
    neighbors.push(cell - layout.columns);
  }

  if (row < layout.rows - 1) {
    neighbors.push(cell + layout.columns);
  }

  return neighbors;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function maxUint32(values: Uint32Array): number {
  let maxValue = 0;

  for (const value of values) {
    maxValue = Math.max(maxValue, value);
  }

  return maxValue;
}

export function validateSocialForceInputs(
  agents: AgentSoA,
  targetPositions: Float32Array,
  params: SocialForceParams,
) {
  if (targetPositions.length < agents.count * 2) {
    throw new Error("targetPositions must contain one vec2 per active agent");
  }

  for (const [key, value] of Object.entries(params)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Social force parameter '${key}' must be positive`);
    }
  }
}

export function normalize2(x: number, y: number): { x: number; y: number } {
  const length = Math.hypot(x, y);

  if (length <= 0.0001) {
    return { x: 0, y: 0 };
  }

  return { x: x / length, y: y / length };
}

export function clampMagnitude(
  x: number,
  y: number,
  maxLength: number,
): { x: number; y: number } {
  const length = Math.hypot(x, y);

  if (length <= maxLength || length <= 0.0001) {
    return { x, y };
  }

  return {
    x: (x / length) * maxLength,
    y: (y / length) * maxLength,
  };
}

export function closestPointOnSegment(
  px: number,
  py: number,
  wall: WallSegment,
): { x: number; y: number } {
  const abX = wall.x2 - wall.x1;
  const abY = wall.y2 - wall.y1;
  const denominator = Math.max(abX * abX + abY * abY, 0.0001);
  const t = clamp(((px - wall.x1) * abX + (py - wall.y1) * abY) / denominator, 0, 1);

  return {
    x: wall.x1 + abX * t,
    y: wall.y1 + abY * t,
  };
}
